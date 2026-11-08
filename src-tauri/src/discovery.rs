use crate::domain::Device;
use serde::Serialize;
use std::net::Ipv4Addr;
use std::time::Duration;

#[derive(Serialize)]
pub struct Scope {
    pub address: String,
    pub interface: String,
    pub prefix: u32,
    pub targets: usize,
}

fn subnet_hosts(ip: Ipv4Addr, mask: Ipv4Addr) -> Result<Vec<Ipv4Addr>, String> {
    let mask = u32::from(mask);
    let prefix = mask.count_ones();
    if !(24..=30).contains(&prefix) || mask != u32::MAX << (32 - prefix) {
        return Err("Discovery supports directly attached IPv4 /24–/30 subnets only (maximum 253 remote targets).".into());
    }
    if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() || ip.is_link_local() {
        return Err("Choose a LAN interface with a usable IPv4 address.".into());
    }
    let network = u32::from(ip) & mask;
    let broadcast = network | !mask;
    Ok(((network + 1)..broadcast)
        .filter(|n| *n != u32::from(ip))
        .map(Ipv4Addr::from)
        .collect())
}

pub fn scopes() -> Result<Vec<Scope>, String> {
    let mut result = Vec::new();
    for interface in if_addrs::get_if_addrs().map_err(|_| "Cannot enumerate local interfaces")? {
        if let if_addrs::IfAddr::V4(v4) = interface.addr {
            if let Ok(hosts) = subnet_hosts(v4.ip, v4.netmask) {
                result.push(Scope {
                    address: v4.ip.to_string(),
                    interface: interface.name,
                    prefix: v4.netmask.to_bits().count_ones(),
                    targets: hosts.len(),
                });
            }
        }
    }
    Ok(result)
}

pub async fn discover(address: &str) -> Result<usize, String> {
    if !cfg!(windows) {
        return Err("Active neighbor discovery is currently available on Windows only.".into());
    }
    // Re-enumerate at invocation time. The frontend cannot supply an arbitrary subnet.
    let interface = if_addrs::get_if_addrs()
        .map_err(|_| "Cannot enumerate local interfaces")?
        .into_iter()
        .find_map(|i| match i.addr {
            if_addrs::IfAddr::V4(v) if v.ip.to_string() == address => Some(v),
            _ => None,
        })
        .ok_or("The selected interface is no longer available")?;
    let hosts = subnet_hosts(interface.ip, interface.netmask)?;
    let count = hosts.len();
    // One TCP attempt per address, at most eight in flight. ARP resolution happens
    // through the OS; no raw packets, packet capture, or frontend shell execution.
    for chunk in hosts.chunks(8) {
        let mut tasks = tokio::task::JoinSet::new();
        for ip in chunk {
            let ip = *ip;
            tasks.spawn(async move {
                let _ = tokio::time::timeout(
                    Duration::from_millis(600),
                    tokio::net::TcpStream::connect((ip, 80)),
                )
                .await;
            });
        }
        while tasks.join_next().await.is_some() {}
    }
    Ok(count)
}

#[cfg(not(windows))]
pub fn neighbors(_at: i64) -> Result<Vec<Device>, String> {
    Ok(vec![])
}

#[cfg(windows)]
pub fn neighbors(at: i64) -> Result<Vec<Device>, String> {
    use windows_sys::Win32::{
        NetworkManagement::IpHelper::{FreeMibTable, GetIpNetTable2, MIB_IPNET_TABLE2},
        Networking::WinSock::{
            NlnsDelay, NlnsPermanent, NlnsProbe, NlnsReachable, NlnsStale, AF_INET,
        },
    };
    struct Table(*mut MIB_IPNET_TABLE2);
    impl Drop for Table {
        fn drop(&mut self) {
            unsafe {
                FreeMibTable(self.0.cast());
            }
        }
    }
    let mut raw = std::ptr::null_mut();
    // SAFETY: Windows allocates the variable-length table. The guard frees it on
    // all exits; rows are read only up to NumEntries, while the table is alive.
    unsafe {
        let error = GetIpNetTable2(AF_INET, &mut raw);
        if error != 0 {
            return Err(format!(
                "Windows neighbor collection failed (OS error {error})"
            ));
        }
        if raw.is_null() {
            return Err("Windows returned an empty neighbor table pointer".into());
        }
        let guard = Table(raw);
        let rows = std::slice::from_raw_parts(
            std::ptr::addr_of!((*guard.0).Table)
                .cast::<windows_sys::Win32::NetworkManagement::IpHelper::MIB_IPNET_ROW2>(),
            (*guard.0).NumEntries as usize,
        );
        let mut devices = Vec::new();
        for row in rows {
            if ![
                NlnsReachable,
                NlnsPermanent,
                NlnsStale,
                NlnsDelay,
                NlnsProbe,
            ]
            .contains(&row.State)
                || row.PhysicalAddressLength != 6
            {
                continue;
            }
            let bytes = &row.PhysicalAddress[..6];
            if bytes[0] & 1 != 0 || bytes.iter().all(|b| *b == 0) {
                continue;
            }
            let addr = Ipv4Addr::from(row.Address.Ipv4.sin_addr.S_un.S_addr.to_ne_bytes());
            if addr.is_multicast()
                || addr.is_loopback()
                || addr.is_unspecified()
                || addr.is_broadcast()
            {
                continue;
            }
            let mac = bytes
                .iter()
                .map(|b| format!("{b:02X}"))
                .collect::<Vec<_>>()
                .join(":");
            devices.push(Device {
                id: format!("{}-{addr}-{mac}", row.InterfaceIndex),
                name: format!("Device {addr}"),
                ip: addr.to_string(),
                mac,
                vendor: "Unknown".into(),
                source: "Windows neighbor table".into(),
                status: if row.State == NlnsReachable {
                    "Reachable"
                } else if row.State == NlnsStale {
                    "Stale"
                } else {
                    "Observed"
                }
                .into(),
                last_seen: at,
                interface: row.InterfaceIndex.to_string(),
                notes: String::new(),
                alias: String::new(),
            });
        }
        devices.sort_by_key(|d| d.ip.parse::<Ipv4Addr>().ok());
        Ok(devices)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovery_is_bounded_to_valid_subnets() {
        let ip = Ipv4Addr::new(192, 168, 1, 12);
        let hosts = subnet_hosts(ip, Ipv4Addr::new(255, 255, 255, 0)).unwrap();
        assert_eq!(hosts.len(), 253);
        assert!(!hosts.contains(&ip));
        assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 1, 0)));
        assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 1, 255)));
        for mask in [
            Ipv4Addr::new(255, 255, 0, 0),
            Ipv4Addr::new(255, 0, 255, 0),
            Ipv4Addr::new(255, 255, 255, 255),
        ] {
            assert!(subnet_hosts(ip, mask).is_err());
        }
        assert!(subnet_hosts(Ipv4Addr::LOCALHOST, Ipv4Addr::new(255, 255, 255, 0)).is_err());
    }
}
