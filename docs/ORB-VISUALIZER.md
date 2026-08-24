# ORB AUDIO VISUALIZER — react to the real voice while speaking

GOAL: When the assistant speaks (Piper TTS playback), the central orb should be a
REAL AUDIO VISUALIZER — driven by the actual audio's frequency/amplitude data,
not a fixed timer. Loud syllables spike it; quiet moments settle it. It must feel
like the orb is producing the voice.

STYLE (my direction, but use your judgment + screenshots to refine): make the ORB
ITSELF the visualizer, in the existing JARVIS arc-reactor vocabulary — don't bolt
a flat oscilloscope line beside it. Suggested: map an FFT frequency spectrum
around the orb's concentric rings — low frequencies drive the inner core
glow/scale pulse, mids and highs drive outward ring segments / spikes that ripple
around the circle. The result should read as the arc-reactor core reacting to
sound. Reactive, organic, tied to the waveform.

## THE KEY TECHNICAL PIECE (do this carefully — don't break working TTS)

- Current TTS plays a plain Audio element (from /api/tts). To visualize it, route
  playback through the Web Audio API: create an AudioContext, a
  MediaElementSourceNode from the audio element (or fetch->decodeAudioData->
  BufferSource), connect through an AnalyserNode, then to destination. Read
  getByteFrequencyData (and/or getByteTimeDomainData) each animation frame to
  drive the orb.
- AudioContext often starts "suspended" until a user gesture — resume it on the
  Send click / first interaction so playback isn't silently blocked. (Sending a
  message is already a user gesture; use it.)
- A MediaElementSource can only be created ONCE per element and re-routing can
  mute audio if done wrong — get this right so the voice STILL PLAYS AUDIBLY with
  the visualizer attached. Verify audio isn't broken.
- The orb lifecycle already has a "speaking" state tied to playback (onplay/
  onended). Hook the visualizer to that: analyser data drives the visuals ONLY
  during speaking; on end, ease back to the idle animation. Keep thinking→
  speaking→idle intact.

## CONSTRAINTS / FALLBACKS

- If voice is OFF or TTS is unavailable, the orb keeps its current timer-based
  animation — the visualizer is an enhancement layered on real audio, not a
  replacement that breaks the no-audio path.
- prefers-reduced-motion: fall back to a calm, minimal reaction (or the existing
  reduced state) — no frenetic strobing.
- Don't touch the Proxmox path, SSH-to-Sol, chat backends, esports, the /sol
  page, or the TTS SERVER (Piper). This is browser-side audio + orb rendering.
- Both assistant backends (Sol, Claude) produce the same audio path, so the
  visualizer works for whichever is speaking.

## VERIFY (you have a browser, but headless has NO audio — be honest about limits)

- Build passes, site 200, no console errors, orb/chat/TTS still work.
- Confirm the Web Audio graph is built and the analyser is reading data during
  playback (you can log/inspect frequency array values are non-zero while a
  clip plays, even if headless can't emit sound). Confirm the orb visual responds
  to those values.
- IMPORTANT: you likely CANNOT hear audio headless, and may not be able to fully
  confirm the visual reaction looks good — the USER will verify the actual
  audio-reactive look over RustDesk. Clearly separate what you confirmed
  (graph built, analyser non-zero, no regressions, audio still plays) from what
  needs the user's eyes/ears.
- Above all: confirm you did NOT break audible playback — the voice must still
  come out of the speakers with the analyser attached.

Build it, self-verify what's verifiable, then STOP and report.
