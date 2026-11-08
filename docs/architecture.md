# Incremental architecture

The first milestone is a runnable desktop shell and a read-only local collector. UI never executes shell commands. The collector and SQLite layer can be tested without a webview via `--no-default-features`; the default feature enables Tauri desktop integration.

Windows discovery now uses GetIpNetTable2 through windows-sys, separate from the interface-counter collector. Explicit discovery is bounded to attached /24–/30 IPv4 networks, eight concurrent TCP attempts, with runtime scope revalidation. A SQLite migration stores device aliases and notes. A native dialog manages inspection focus.

Next: add adapter operational state, historical presence and transition events; introduce a cancellation-aware scheduler before recurring endpoint checks. Keep validation and timeouts in Rust. Router controls need independently tested vendor adapters.

Enterprise expansion should introduce collector traits and application services independent of Tauri. Axum can reuse those services with PostgreSQL, site identity, RBAC and audit storage. SNMP, syslog and vendor APIs must supply their own source provenance. Links must come from supported topology sources. Administrative actions require explicit scope, server-side authorization, audit events and confirmation.

At the user's later request, a separate experimental lab service implements explicit, time-limited IPv4 ARP redirection and userspace forwarding through dynamically loaded Npcap. It does not run with discovery or collect payload logs. Lab commands validate confirmation, duration, current local scope, peer/interface mappings and audit availability before packet redirection. A native RAII guard attempts ARP correction on stop/error, and normal window close cancels/joins the worker. Forced process termination is outside this cleanup guarantee. See README for requirements and unvalidated behavior.

Release gates: Windows interface/counter validation, WebView2 startup, NSIS installation/uninstallation, DPI and keyboard testing, CSP/IPC review, bounded queries and retention tests, collection lifecycle tests, and signed artifacts. No Windows readiness claim follows from a passing browser or headless Rust test.
