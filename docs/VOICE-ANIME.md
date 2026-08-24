# FIND A HIGH-PITCHED ANIME-GIRL VOICE FOR PIPER (samples for the user to pick)

The Piper TTS pipeline works. The default (en_GB-cori-medium) is British and
wrong — the user wants a HIGH-PITCHED JAPANESE WOMAN speaking English, a generic
"anime girl" vibe (doesn't need to be a specific character). Find the closest
option Piper can do and let the user JUDGE BY EAR. This is a voice swap +
possible pitch-shift, not new architecture.

## DO THIS

1. SEARCH the full Piper voices library (you saw 174 voices; you filtered to 38
   English before). This time specifically look for:
   - Any English voice from a Japanese speaker / Japanese-accented English, if
     one exists in the library.
   - The highest-pitched / brightest FEMALE English voices (you measured median
     F0 before — sort by that; higher = closer to the anime timbre).
   Download the best 3-4 candidates.

2. PITCH-SHIFT experiment. Piper itself doesn't do pitch, but you can shift the
   output WAV up after synthesis (e.g. via a librosa/pysox/ffmpeg step in the
   TTS service, or Piper's --length-scale to tweak pacing). Take the brightest
   1-2 female voices and produce pitch-shifted-up variants (try ~+2 to ~+5
   semitones) to push toward the anime register. Keep it intelligible — too much
   shift gets chipmunky; find the sweet spot.
   - If you add a pitch step to the TTS service, make it OPTIONAL and configurable
     (env var like PIPER_PITCH_SEMITONES, default 0) so it's a knob, not a
     hardcode. Don't break the existing clean path.

3. GENERATE SAMPLES. Same sentence for every candidate (raw + pitch-shifted
   variants) so they're comparable. Pick a line that shows the voice off — maybe
   something the assistant would actually say, like "Systems online. All
   subsystems operational. How can I help, commander?" Save WAVs to a known dir
   and, since the user is remote, ALSO note how they can grab/play them (the
   shots/ or a served path). Attach or list every sample with a clear label
   (voice name + pitch shift).

4. REPORT a short ranked recommendation — which candidate you think best matches
   "high-pitched anime girl speaking English," with the measured F0 and your
   reasoning — but make clear the final pick is the user's ears. Tell them the
   exact one-line change (PIPER_VOICE / PIPER_PITCH_SEMITONES) to lock in
   whichever they choose.

## HONEST GUARDRAIL

If NONE of Piper's voices get acceptably close to the Japanese-anime target
(likely — Piper's library skews Western), SAY SO plainly in the report rather
than overselling a mediocre match. In that case, lay out what the XTTS
voice-cloning path would take (a short voice sample, more compute) so the user
can decide if it's worth it. Don't start cloning without asking.

## CONSTRAINTS

Only touch the Piper service / TTS voice config. Don't change the Proxmox path,
SSH-to-Sol, chat backends, or esports. Keep the localhost binding.

Build the samples, then STOP and report with the audio for the user to judge.
