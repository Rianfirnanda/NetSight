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

Demo values are synthetic and explicitly labeled. Live observations represent this machine only. Interface counters can include virtual and loopback adapters; aggregating them can double count traffic. IP matching uses OS interface names; unsupported mappings remain empty. No router bandwidth, LAN-wide coverage, reachability status, or physical links are inferred.

## Remaining work

Windows neighbor-table collector, adapter operational status, persistent device inventory, deduplicated live events, scheduled endpoint monitoring, configurable retention, robust modal focus management, Windows packaging verification, and enterprise integrations remain future work. Current alerts and device inventory are demonstrated with synthetic data; live mode returns empty lists for these unsupported capabilities. Endpoint checks are one-shot, not scheduled. Preferences/read state use frontend local storage; telemetry uses SQLite. NSIS signing and deployment credentials are not configured.

See `docs/architecture.md` for expansion boundaries. Run only checks against endpoints you are authorized to manage.
