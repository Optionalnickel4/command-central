You're working on Command Central, a personal Jarvis-style dashboard. Read CLAUDE.md in full before touching anything — it has hard rules about the Proxmox route and the SSH-to-Sol link that you must not break.

We're working in PHASES. Do NOT do everything at once. Complete a phase, make sure the build passes and the site still serves with the homelab panel and Sol chat both working, then STOP and tell me what you did so I can look before the next phase. After each phase, run: npm run build, restart the service, and confirm curl -s localhost:3000/api/widgets/homelab still returns real data.

The overall goal: make this look jaw-dropping and maximal — a real "Iron Man HUD." Think cinematic boot-up on load, holographic depth and parallax, glows that pulse with system activity, and animated live data-viz everywhere. Go bold; I'll tell you if it's too much. Keep everything LAN-only, no auth. Preserve the widget-registry pattern and the reduced-motion gating.

=== PHASE 1 — The look (do this first, then stop) === Transform the visual layer into something cinematic and maximal, WITHOUT changing any data logic or the API routes:

A short cinematic boot-up/intro sequence when the page loads (system-online animation, panels powering on in sequence) — skippable, and it must respect prefers-reduced-motion.
Add depth: subtle parallax/3D layering on panels, holographic sheen, animated gradient/grid background with more life than the current static grid.
Make glows and accents reactive — e.g. the header/ticker pulse subtly with live system load, gauges have more animated life (sweep-in, glow trails).
Level up the radial gauges and add animated live line/bar graphs for the node CPU/RAM history (keep a rolling in-memory history client-side for now).
Polish typography, spacing, and the overall composition so it reads as a designed cockpit, not a set of boxes. Then STOP and let me review before Phase 2.

=== PHASE 2 — Sol self-status (after I approve Phase 1) === Add a panel where Sol (the OpenClaw agent) reports its OWN status. The chat already reaches Sol by SSH (see CLAUDE.md). The openclaw agent --json output includes meta (provider, model, session, token usage). Surface that as a live "assistant status" readout — model, provider, session, last-turn token usage, responsiveness. If practical, add a way to ask Sol for a self-report. Don't widen the SSH key's scope to do this.

=== PHASE 3 — Data sources (after I approve Phase 2) ===

Wire real WEATHER via open-meteo (no key needed; lat/lon already in .env.local).
Add an ESPORTS section pulling from my vlr-api (Valorant esports data). I'll give you VLR_API_URL to put in .env.local. Make it a big, broadcast-style section: live/upcoming match scores, team/player stats, and a scoreboard-style ticker. Add a new server-side route (never call vlr-api from the client). Ask me for the API URL and I'll tell you the endpoints.

=== PHASE 4 — Voice (after I approve Phase 3) === Add full conversational voice to the assistant: speak a query (speech-to-text) and hear Sol's replies spoken back (text-to-speech). Browser-native Web Speech API is fine to start (works on the LAN, no extra services). Wire it into the existing Sol chat path — voice in → same SSH-to-Sol call → voice out.

Start with Phase 1 now. Read CLAUDE.md first, then go.
