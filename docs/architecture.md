# Incremental architecture

The first milestone is a runnable desktop shell and a read-only local collector. UI never executes shell commands. The collector and SQLite layer can be tested without a webview via `--no-default-features`; the default feature enables Tauri desktop integration.

Next: split collection, persistence and commands as capabilities grow. Add GetIpNetTable2/GetIfTable2 via maintained Windows bindings for neighbor inventory and adapter state. Store source attribution alongside each observation. Persist device first/last seen and deduplicated transition events; introduce a cancellation-aware Tokio scheduler before scheduled endpoint checks. Keep endpoint validation and timeouts at the Rust boundary. Add UI schema validation for future configurable integrations.

Enterprise expansion should introduce collector traits and application services independent of Tauri. Axum can reuse those services with PostgreSQL, site identity, RBAC and audit storage. SNMP, syslog and vendor APIs must supply their own source provenance. Links must come from supported topology sources. Administrative actions require explicit scope, server-side authorization, audit events and confirmation; no packet interception or disruptive network techniques are part of this product.

Release gates: Windows interface/counter validation, WebView2 startup, NSIS installation/uninstallation, DPI and keyboard testing, CSP/IPC review, bounded queries and retention tests, collection lifecycle tests, and signed artifacts. No Windows readiness claim follows from a passing browser or headless Rust test.
