# CHUNK TTS — speak the whole reply, sentence by sentence

PROBLEM: Long assistant replies get spoken only up to the ~400-char narration
cap, then the voice stops (the TEXT is complete on screen — only the VOICE cuts
off). Confirmed with a long reply from the CLAUDE backend. Fix: speak the ENTIRE
reply by chunking it into sentences and synthesizing/playing them in sequence,
removing the hard length cap while avoiding the Piper synthesis timeout that the
400-char cap was protecting against.

## APPROACH

- Client splits the reply into chunks on sentence boundaries (., !, ?, newlines),
  keeping chunks to a safe size (e.g. ~300 chars max; if a single "sentence" is
  longer, split on clause/comma or hard-wrap). Preserve reading order.
- Play chunks SEQUENTIALLY through the SAME persistent <audio> element + the
  existing Web Audio graph (do NOT create new source nodes — the one-source-node
  design must be preserved; just swap src per chunk, same as it swaps per reply
  today). When one chunk's audio ends, fetch/play the next.
- PIPELINE for smoothness: while chunk N is playing, pre-fetch chunk N+1 from
  /api/tts so there's no audible gap between sentences. A small queue.
- The VISUALIZER must keep flowing across chunks — the orb stays in "speaking"
  and keeps reacting continuously through the whole reply, only handing off to
  idle after the LAST chunk ends. Don't let it settle-then-restart between
  sentences (that would look like a stutter).
- Remove/raise the per-request 400-char cap NOW that each request is one short
  chunk — but keep a sane per-CHUNK cap so any single Piper call stays fast and
  under the 60s route timeout. The cap moves from "whole reply" to "per chunk".
- Keep the LRU cache working per-chunk (repeated sentences/greetings still cache).

## INTERRUPTION / CLEANUP (important)

- If the user sends a NEW message while a multi-chunk reply is still speaking,
  STOP the queue immediately: cancel pending fetches, stop current audio, clear
  the queue, then start the new reply. No overlap, no leftover chunks playing
  under the new answer.
- Toggling voice OFF mid-reply stops the queue cleanly too.

## FALLBACKS (unchanged, keep them)

- Voice off → no TTS, timer orb. Reduced-motion → static bars. Piper/graph fail
  → plain playback (and if a chunk fails, don't wedge the queue — skip or stop
  gracefully, text is always fully on screen anyway).

## VERIFY (headless has no speakers — be honest)

- Build passes, site 200, no console errors, chat/orb/esports/sol/TTS healthy.
- Confirm a long reply produces MULTIPLE sequential /api/tts requests (one per
  chunk) in order, the queue advances on audio-ended, and pre-fetch overlaps.
- Confirm the visualiser stays in speaking state across chunk boundaries and
  only hands to idle after the final chunk.
- Confirm sending a new message mid-reply cancels the queue (no double audio).
- You can't HEAR gaplessness — the USER confirms the audio actually sounds
  smooth and complete over RustDesk. Separate confirmed-from-code vs needs-user-ears.

## CONSTRAINTS

Browser-side + the /api/tts route only. Don't touch Piper server config beyond
what's needed, don't touch Proxmox/SSH-to-Sol/chat backends/esports/ /sol.
Preserve the single-audio-element / single-source-node design.

Build it, self-verify, then STOP and report.
