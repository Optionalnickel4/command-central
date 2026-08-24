The orb redesign landed well. Two things to add now: (A) much more real detail about the servers, and (B) make the cockpit feel connected and operational — the orb should feel wired to the panels, and there should be a command bar.

=== PART A — DEEPER HOMELAB DETAIL (real data, not mock) ===

Right now the homelab route only uses Proxmox /cluster/resources, which gives CPU/mem/status but NOT ip, disk, network, or uptime. Expand it.

For richer per-container data, ALSO call these PVE endpoints (the read-only token already has permission — test with curl first to see real shapes):

Per guest status/current: /api2/json/nodes/{node}/lxc/{vmid}/status/current → gives uptime, disk read/write, netin/netout, mem in bytes, swap, etc. (For VMs it's .../qemu/{vmid}/status/current.)
Per guest config (for the IP): /api2/json/nodes/{node}/lxc/{vmid}/config → the net0 field contains the IP (e.g. "ip=10.0.0.x/24"). Parse it out.
Node detail: /api2/json/nodes/{node}/status → load average, uptime, CPU info, memory, and (if available) temps via the same or the node RRD.

IMPORTANT performance note: don't fire one request per container on every poll if it's slow — fetch cluster/resources for the list, then fan out the detail calls in parallel (Promise.all), and consider a slightly longer poll interval for the heavy detail (e.g. 30s) vs the light gauges (15s). Keep the shared WidgetResponse shape. Keep the https-module approach (NOT fetch/undici) — see CLAUDE.md rule.

Surface this new detail in the UI:

Per container: uptime, real RAM (MB/GB, not just %), disk usage, network up/down, and IP address.
Make container rows EXPANDABLE — click a row to reveal the full detail for that container (IP, uptime, disk, net I/O) without leaving the page.
Node panel: show load average, uptime, and temps if available.
Keep it readable — this is a lot of data; use the HUD style to make it scan well, don't just dump numbers.

=== PART B — LIVING CORE + COMMAND BAR (the "missing something") ===

The orb is currently beautiful but isolated. Make it feel WIRED to the cockpit:

DATA STREAMING ALONG THE CONDUITS. The conduits from the orb to the left/ right clusters should show animated flowing pulses/particles — data moving between the core and the panels. When a panel updates (new poll) or a container is under load, send a visible pulse down that conduit. It should feel like the core is feeding/receiving from the panels, continuously.
A BOTTOM COMMAND BAR. Add a persistent command bar across the bottom of the cockpit — a row of quick-action / status controls in the HUD style. For now (no service-control actions yet — read-only), it can include: a system summary readout (nodes online, total CPU/mem across cluster, alerts count), quick-jump buttons that scroll/focus a section (Homelab / General / later Esports), a clock/uptime, and a command-input affordance (a "/" command palette style input is great even if it just routes to Sol for now). Make it feel like the base of a cockpit console.

CONSTRAINTS (unchanged):

Presentation + the documented PVE data expansion only. Do NOT change the SSH-to-Sol transport or the chat route's behavior.
Preserve the widget-registry / cluster pattern.
prefers-reduced-motion: streaming pulses settle to static.
After building: npm run build, sudo systemctl restart command-central, and verify the homelab API still returns live data (now with the new fields) and the site serves 200.

Build Part A and Part B, get them rendering with real data, then STOP and report (note anything you couldn't verify without a browser). Don't start any later phase.
