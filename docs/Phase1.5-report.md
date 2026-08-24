# Phase 1.5 — Redesign Report

Completed 2026-08-19. Build passes, service restarted, live data flowing.

## The quick fix (confirmed working)

`export const dynamic = "force-dynamic"` on all four widget routes. They now
report `ƒ (Dynamic)` instead of `○ (Static)`, and repeated reads return
advancing timestamps with changing values (RAM moved 8.4→8.6 GB during
testing). `/api/chat` needed nothing — POST handlers are always dynamic.

This also unblocks the Phase 1 history graphs, which sample per poll and
previously could never collect a second point.

## The composition rebuild

Phase 1 was shimmer on the same three rows. This changes the structure.

**The Sol orb is now the hero** (`components/sol-orb.tsx`) — layered SVG: a
72-tick outer ring, counter-rotating cyan arc shells, a dashed gold ring,
segmented inner ring, energy shell, and a white-hot core with orbiting motes.
It reacts to Sol:

| State | Behaviour |
|---|---|
| Idle | slow 26s rotation, calm 3.6s core pulse, cyan |
| Thinking | spins up to 5.5s, core pulses at 0.85s, glow to max |
| Speaking | 0.5s pulse burst, held for a beat scaled to reply length |
| Error | red, dimmed, rings stutter via `steps(11)` instead of gliding |

State is driven from the real chat lifecycle through a small context
(`sol-state.tsx`) — **the SSH transport is untouched**; the console still
POSTs to `/api/chat` exactly as before.

**Layout is now radial, not stacked.** Left and right clusters frame the core,
with animated energy conduits running from the orb out to each side, panels
angled inward (`rotateY(±7°)`, straightening on hover), and a curved divider
under the header. The core column is sticky on wide screens; on narrow screens
the orb hoists to the top and everything stacks.

**The registry pattern got stronger, not weaker.** `widget-grid.tsx` is gone,
replaced by `widget-cluster.tsx`. Widgets now declare
`cluster: "left" | "right"`, and the shell renders clusters rather than named
sections — so adding a new section (esports, Sol status) is now *registry-only*
and needs no shell edit at all. The architecture and extension-pattern sections
of CLAUDE.md were updated to match, since they described the removed file.

## One bug caught in my own work

The first orb draft used `stopColor="var(--orb-hue)"` and
`stroke="var(--orb-accent)"` as SVG attributes. `var()` doesn't work in SVG
presentation attributes — the core gradient and gold ring would have rendered
colorless. All three bindings moved into CSS classes; verified
`stop-color:var(--orb-hue)`, `fill:var(--orb-hue)` and
`stroke:var(--orb-accent)` are in the shipped bundle.

## Verification

1. ✅ `npm run build` — passes, types + lint clean
2. ✅ Site serves HTTP 200
3. ✅ Homelab returns live, advancing data (weather/calendar/news all `ok` too)
4. ❌ **Sol chat still down** — unchanged and still Sol-side: SSH auth
   succeeds, but the wrapper on `10.0.0.152` exits 1 with empty stdout *and*
   stderr. The key and its scope were not touched.

Reduced-motion gating extended to every new animation — the orb settles into a
calm, fully-formed static state rather than disappearing.

## Caveats

- There's still no browser on this box, so the markup and CSS are verified but
  the result has **not been seen rendered** — the composition is best judgment,
  not a confirmed look.
- With Sol down, the orb jumps to its red stutter state the moment a message is
  sent. That's correct designed behaviour, not a rendering fault, but the
  thinking/speaking states won't be visible until the link is back.

## Files changed

**New**
- `components/sol-orb.tsx` — the centrepiece core
- `components/sol-state.tsx` — SolStateProvider / useSolState
- `components/widget-cluster.tsx` — orbital cluster renderer

**Rewritten**
- `components/dashboard-shell.tsx` — cockpit composition, orbit conduits
- `components/assistant-panel.tsx` — core console; publishes Sol state
- `components/widgets/registry.ts` — cluster field, SECTION_TITLES
- `components/widgets/types.ts` — WidgetCluster type
- `app/globals.css` — cockpit + orb style systems

**Edited**
- `app/api/widgets/{homelab,weather,calendar,news}/route.ts` — force-dynamic
- `components/widgets/homelab-panel.tsx` — stacked layout for narrow columns
- `CLAUDE.md` — architecture + extension pattern updated

**Removed**
- `components/widget-grid.tsx` — superseded by widget-cluster.tsx
