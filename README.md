# NetSight

A Windows desktop network observability workspace built with Tauri 2, Rust, React and TypeScript. This is an incremental foundation release, not the complete enterprise product.

## Requirements and development

Node.js 22+ with npm, stable Rust with rustfmt and Clippy. Windows development requires Visual Studio C++ Build Tools, the Windows SDK, and WebView2. Linux desktop development additionally requires GTK 3 and WebKitGTK 4.1 development packages; see the official Tauri prerequisites.

```sh
npm ci
npm run dev           # Browser workspace; synthetic demo mode
npm run tauri dev     # Desktop workspace; demo and local live collection
npm run build
npm run lint
npx prettier --check src
cd src-tauri
cargo fmt --check
cargo test --no-default-features
cargo clippy --no-default-features -- -D warnings
```

Browser tests: `npx playwright test` uses system Chromium by default. Set `CHROMIUM_PATH` to override its path. Windows packaging: `npm run tauri build` from the repository root on Windows produces the NSIS installer. Windows packaging and Windows collector behavior must be validated on Windows before release.

## Download a Windows installer from GitHub

Open the repository's **Actions** tab and select **Windows installer**. Every push to `main` starts a Windows x64 build; you can also select **Run workflow** to start one manually. Once the run succeeds, download `NetSight-Windows-x64-<run number>` under **Artifacts**, extract the ZIP, and run the included `.exe`. GitHub requires you to sign in to download artifacts. Artifacts are retained for 30 days. These builds are unsigned; inspect Windows security prompts and only install builds you trust. A successful build does not replace testing installation and live collection on Windows.

## Implemented features

Seven navigable workspace pages, light/dark appearance, design tokens, responsive shell, Lucide icons, a shadcn-style Radix Button, loading/error/empty states, searchable/sortable device table with column visibility and detail drawer, ECharts history, interactive XYFlow observed-device canvas, event severity filtering and read-state persistence, JSON export, and clearly separated demo/live modes.

Rust owns OS interface enumeration, MAC/IP information, counter differences, TCP checks with a five-second timeout, and SQLite migrations/history. UI polls every five seconds in live mode; polling stops when unmounted or switched to demo. Data collection occurs on demand through async commands, not through a persistent background daemon. History is pruned to 24 hours after each sample; charts return the latest 720 samples. First sample establishes a counter baseline. TCP checks are explicit single-endpoint requests and measure DNS resolution plus TCP connection time, never ICMP latency.

## Architecture and sources

`src/app` composes presentation; `features` contains page interactions; `components/ui` holds primitives; `services/network.ts` is the typed Tauri boundary and isolated demo dataset. Rust domain types and collection/persistence live in `src-tauri/src`; migrations are versioned in `src-tauri/migrations`. No shell or filesystem plugin permissions are granted to the frontend. SQLite lives in the OS app-data directory.

Demo values are synthetic and explicitly labeled. Desktop starts in live mode; browser starts in demo mode. Live counters represent this machine. Windows inventory reads `GetIpNetTable2` and includes this computer's local IPv4 addresses. `Reachable` and `Stale` describe Windows neighbor-cache states, not continuous health checks. IP matching uses OS interface names; unsupported mappings remain empty. Virtual/loopback counters can double count traffic. Physical links and other devices' bandwidth are not inferred.

## Device discovery

On Windows open **Devices**, choose the correct LAN IPv4 interface, then **Discover subnet**. This makes one TCP connection attempt to port 80 on each remote host in a directly attached /24–/30 subnet, with 600 ms timeout and at most eight concurrent attempts. The OS resolves neighbors even when port 80 is closed; results are read from its neighbor cache. Discovery is explicit, not continuously repeated. Concurrent scans are rejected. The backend re-enumerates local interfaces and rejects arbitrary target subnets. Maximum scope is 253 remote targets. Larger subnets and IPv6 active discovery are not yet supported.

Neighbors may already appear passively without a scan. Sleeping devices, Wi-Fi client isolation, separate VLANs, VPN routing, and ARP filtering limit visibility. Discovery cannot guarantee every connected device; complete coverage needs authorized router/DHCP integration. Vendor and hostnames remain unknown unless sourced; users can save aliases and notes in SQLite. Aliases are keyed by interface/IP/MAC to avoid silently labeling a different device after IP reuse. Live discovery is Windows-only; Linux can show local interface addresses.

## Remaining work

Adapter operational status, historical device presence, deduplicated live events, scheduled endpoint monitoring, configurable retention, Windows runtime verification, and router integrations remain future work. Live events remain empty. Endpoint checks are one-shot. Preferences/read state use local storage; telemetry and device metadata use SQLite. Device inspection uses a native modal dialog with focus containment and Escape dismissal. NSIS signing is not configured. Lab bandwidth policing and blocking apply only to the selected session's forwarded IPv4 traffic; they do not administer the router or disconnect a device from Wi-Fi.

Router support must be implemented and validated per vendor/protocol; no universal control API exists. A future adapter layer may support MikroTik RouterOS, UniFi, OpenWrt or other documented management APIs. Device blocking and shaping require administrator credentials, server-side authorization, confirmation and audit events. Traffic analysis should consume authorized local captures or mirrored traffic; passive discovery is not packet capture.

See `docs/architecture.md` for expansion boundaries. Run only checks against endpoints you are authorized to manage.

## Experimental IPv4 interception lab

**Not validated on Windows/Npcap.** Implemented for the user's own authorized lab; runtime testing is delegated to the user at their request. Compilation and frontend build checks are not evidence of working forwarding or recovery. This is not a claim of feature parity with NetCut or support for every router.

Install Npcap separately from its official site (`https://npcap.com/`), observe its license, and run NetSight with adapter access (typically **Run as administrator**). The installer does not bundle Npcap, install a packet driver, change Windows firewall settings, or enable OS IP forwarding. The rest of NetSight does not require elevated privileges.

In **Devices**, refresh/discover the lab subnet. Then open **Monitoring → IPv4 interception lab**. Choose a local IPv4 interface, an explicitly authorized target and gateway, and a 30–300 second duration. Both peers must have Windows neighbor entries and distinct MAC addresses on the same interface. Before redirection, Windows resolves the two selected peers and the backend rejects unavailable peers or changed MAC addresses. A stale cache entry is not treated as proof that a device is offline. Type the displayed `LAB <target IP> <gateway IP>` confirmation to start. Gateway selection is explicit: the UI does not infer which observed device is a router.

The native worker loads only System32/Npcap's `wpcap.dll`, matches the selected IP and Windows interface GUID to the Npcap device, applies a BPF filter for the chosen peer MAC/IP pairs, and sends ARP redirection replies. It forwards matching untagged IPv4 Ethernet frames in userspace, rewriting only Ethernet addresses. It does not decrypt TLS, extract credentials, store payloads, or intercept IPv6. Forwarded frames/bytes and remaining duration appear in the UI. A global **Stop & restore ARP** control remains visible across pages and demo/live switches.

Stopping, timeout, handled errors, and ordinary window close attempt to send the original target/gateway ARP mappings three times before closing the capture handle. This is **best effort**: it does not prove that peer caches accepted the correction. Power loss, forced termination, NIC failure, ARP inspection, isolation, or driver limitations can prevent forwarding or recovery. Verify connectivity and neighbor mappings on both lab devices; manually clear their neighbor caches or reconnect them if needed. Do not use this unvalidated mode on production networks.

Session start/finish metadata is appended to `lab-audit.jsonl` in the application's OS data directory, without packet payloads or credentials. New sessions require the audit to be writable and refuse to start once the file exceeds 1 MiB; archive it manually to continue. A process crash can leave a start record without a completion record. Packet loss, throughput, Wi-Fi compatibility, shutdown recovery, and NSIS installation still require Windows lab validation.

## Bandwidth control scope

From an observed Windows neighbor's inspector choose **Open bandwidth controls**, or open **Monitoring**. Set upload/download limits in decimal kbps (1 Mbps = 1,000 kbps); blank means unlimited. **Block forwarded IPv4 traffic** drops both directions for the selected target during the lab session. Unchecking it and applying the policy resumes forwarding with the configured limits. Stopping the session ends redirection and attempts ARP restoration.

Active sessions allow policy changes after the exact `CONTROL <target IP> <gateway IP>` confirmation. Changes are recorded before being applied. Counters distinguish forwarded upload/download bytes and policy-dropped frames. Caps include Ethernet frame bytes, excluding FCS. Implementation is token-bucket **policing**, not queued shaping: excess frames are dropped. Each direction has at most 64 KiB of idle burst credit, starts with no credit on a changed limit, and uses no packet queue. This bounds memory and avoids blocking the capture worker, but low limits can cause retries/stalls and application throughput is not guaranteed.

This mechanism is router-vendor independent **only when the selected IPv4 frames traverse NetSight successfully**. It cannot impose universal QoS on arbitrary routers, IPv6 traffic, bypass paths, client-isolated Wi-Fi or other VLANs. Direct router QoS still needs a tested management integration. Native bandwidth/blocking behavior has not been tested on a real network, per the user's request; compile checks do not establish runtime correctness.

| Capability | Current scope |
| --- | --- |
| Device list, search, notes and aliases | Windows IPv4 neighbors and local interfaces |
| Separate upload/download caps | One selected, time-limited lab session |
| Block/resume | Forwarded IPv4 traffic in that session |
| Change policy during a session | Explicit target/gateway confirmation and local audit |
| Control every connected device simultaneously | Not implemented |
| Persistent schedules or router-wide QoS | Not implemented |
| IPv6, TLS decryption, cross-VLAN control | Not implemented |

This is not complete NetCut feature parity and is not a universal network controller.
