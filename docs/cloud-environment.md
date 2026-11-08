# Cloud setup status

The onboarding service returned `INVALID_ARGUMENT` when reading and saving the environment draft. Persistence of `install_script` and `start_skill` could not be confirmed. This file is a local fallback, not a published cloud configuration.

Use the existing `/workspace/NetSight` checkout. Tasks are isolated; do not create a worktree unless explicitly requested.

Current tools: Node.js 24, npm 11, system Chromium `/usr/bin/chromium`, Rust stable installed in `/workspace/.cargo` and `/workspace/.rustup`.

```sh
export npm_config_cache=/workspace/.npm
export RUSTUP_HOME=/workspace/.rustup
export CARGO_HOME=/workspace/.cargo
export PATH="$CARGO_HOME/bin:$PATH"
export CARGO_BUILD_JOBS=2
cd /workspace/NetSight
npm ci --no-audit --no-fund
npm run build
npm run lint
npx playwright test
cd src-tauri
cargo fmt --check
cargo test --locked --no-default-features
cargo clippy --locked --no-default-features -- -D warnings
```

Fresh machines without Rust: fetch the official installer from `https://sh.rustup.rs` over verified HTTPS and run with `--profile minimal --default-toolchain stable --no-modify-path`, using the directories above. Then run `rustup component add rustfmt clippy`. Preserve inherited proxy and CA trust.

Start the browser workspace with `npm run dev` from the repository root. Validate with browser tests. Live telemetry requires Tauri IPC. Processes must restart after snapshot restoration; retained dependencies do not imply a running server.

Linux desktop validation is blocked by missing GTK 3/WebKitGTK 4.1 development libraries. Neither sudo nor the scoped package helper exists here; an attempted system installation failed with filesystem permission errors. An administrator must provide Tauri Linux prerequisites. Do not alter privilege configuration. Windows requires C++ Build Tools, Windows SDK and WebView2; run `npm run tauri dev` and `npm run tauri build` there before claiming Windows readiness.

See README for functional limitations. No additional credentials are required for the implemented workflow. No cloud configuration publication or new-task restoration has been verified.
