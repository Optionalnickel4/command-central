"use client";

/**
 * Voice playback + analysis for the core orb.
 *
 * WHY A SINGLETON WITH ONE PERSISTENT <audio>:
 * createMediaElementSource() may be called only ONCE per element, and once an
 * element is routed into a graph its output goes exclusively through that graph.
 * Creating a fresh Audio per reply (the previous approach) would mean either a
 * new source node every time — leaking nodes — or, worse, a second call on the
 * same element throwing and leaving playback silent.
 *
 * So: one element for the lifetime of the page, one source node, and each reply
 * simply swaps `src`. The graph is built once and never rewired.
 *
 * Graph:  <audio> -> MediaElementSource -> Analyser -> destination
 *
 * If ANY part of graph construction fails we discard that element entirely and
 * fall back to a clean, ungraphed Audio element: no visualiser, but the voice
 * still plays. Audible playback always wins over the visual enhancement.
 */

export interface VoiceFrame {
  /** 0..1 loudness from the time-domain signal (RMS) — drives the core. */
  level: number;
  /** 0..1 band energies from the FFT. */
  low: number;
  mid: number;
  high: number;
  /** Normalised spectrum (0..1 per bin) for the ring bars. */
  spectrum: Float32Array;
}

const SPECTRUM_BINS = 48;

/** Per-chunk ceiling. Each /api/tts call stays short, so synthesis is fast and
 *  nowhere near the route's 60s timeout — the cap that used to truncate the
 *  whole reply now only decides where we break between sentences. */
const MAX_CHUNK_CHARS = 280;

/**
 * Split a reply into speakable chunks on sentence boundaries, preserving order.
 *
 * Falls back progressively: sentences → clauses (comma/semicolon/dash) → hard
 * word wrap, so a single runaway sentence can never exceed the cap.
 */
export function chunkForSpeech(text: string, max = MAX_CHUNK_CHARS): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];

  // Sentence-ish pieces, keeping their terminating punctuation. Newlines are
  // treated as hard breaks so lists and paragraphs don't run together.
  const pieces: string[] = [];
  for (const line of clean.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sentences = trimmed.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g);
    if (sentences) pieces.push(...sentences.map((s) => s.trim()).filter(Boolean));
    else pieces.push(trimmed);
  }

  const split = (piece: string): string[] => {
    if (piece.length <= max) return [piece];
    // Too long for one breath — break on clause punctuation first.
    const clauses = piece.split(/(?<=[,;:—–])\s+/);
    const out: string[] = [];
    let buf = "";
    for (const clause of clauses) {
      if (clause.length > max) {
        if (buf) { out.push(buf); buf = ""; }
        // Still too long: hard wrap on word boundaries.
        let line = "";
        for (const word of clause.split(/\s+/)) {
          if ((line + " " + word).trim().length > max) {
            if (line) out.push(line.trim());
            line = word;
          } else {
            line = (line + " " + word).trim();
          }
        }
        if (line) out.push(line.trim());
      } else if ((buf + " " + clause).trim().length > max) {
        if (buf) out.push(buf);
        buf = clause;
      } else {
        buf = (buf + " " + clause).trim();
      }
    }
    if (buf) out.push(buf);
    return out;
  };

  // Pack sentences together up to the cap so we don't make needless requests.
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    for (const part of split(piece)) {
      if (!current) {
        current = part;
      } else if ((current + " " + part).length <= max) {
        current = `${current} ${part}`;
      } else {
        chunks.push(current);
        current = part;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

class VoiceAudio {
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private built = false;
  private graphOk = false;

  // Backed by an explicit ArrayBuffer: the analyser's getByte*Data signatures
  // require Uint8Array<ArrayBuffer>, not the wider ArrayBufferLike.
  private freqData = new Uint8Array(new ArrayBuffer(0));
  private timeData = new Uint8Array(new ArrayBuffer(0));
  private spectrum = new Float32Array(SPECTRUM_BINS);
  private currentUrl: string | null = null;

  /** Bumped on every new utterance/cancel; stale queues check it and bail. */
  private generation = 0;
  /** Aborts in-flight chunk pre-fetches when the queue is cancelled. */
  private inflight: AbortController | null = null;
  /** Settles the currently-awaited chunk so cancel() can't wedge the queue. */
  private endCurrent: ((ok: boolean) => void) | null = null;

  /** True when the analyser is available, i.e. the orb can visualise. */
  get canVisualize(): boolean {
    return this.graphOk && this.analyser !== null;
  }

  private build(): void {
    if (this.built) return;
    this.built = true;

    const el = new Audio();
    el.preload = "auto";

    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!Ctx) {
      // No Web Audio at all — plain playback, no visualiser.
      this.el = el;
      this.graphOk = false;
      return;
    }

    try {
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;              // 128 bins, cheap and responsive
      analyser.smoothingTimeConstant = 0.72;

      source.connect(analyser);
      analyser.connect(ctx.destination);   // MUST reach destination or it's silent

      this.el = el;
      this.ctx = ctx;
      this.analyser = analyser;
      this.freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      this.timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      this.graphOk = true;
    } catch {
      // Discard the possibly half-routed element and start clean, so a failed
      // graph can never leave the user with muted audio.
      this.ctx = null;
      this.analyser = null;
      this.graphOk = false;
      this.el = new Audio();
      this.el.preload = "auto";
    }
  }

  /** Call from a user gesture (the Send click) — contexts start suspended. */
  async resume(): Promise<void> {
    this.build();
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* non-fatal: playback may still work */
      }
    }
  }

  /** Play one already-fetched clip; resolves when it ENDS (or fails). */
  private playOne(url: string, onPlay: () => void): Promise<boolean> {
    const el = this.el;
    if (!el) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        el.onplay = null;
        el.onended = null;
        el.onerror = null;
        this.endCurrent = null;
        resolve(ok);
      };
      // cancel() calls this so a stopped clip never leaves the queue awaiting
      // an "ended" event that will now never fire.
      this.endCurrent = finish;

      el.onplay = onPlay;
      el.onended = () => finish(true);
      el.onerror = () => finish(false);

      el.src = url;
      try {
        el.currentTime = 0;
      } catch {
        /* not seekable yet — harmless */
      }
      el.play().catch(() => finish(false)); // autoplay policy, etc.
    });
  }

  /**
   * Speak a whole reply as an ordered queue of chunks through the SAME element
   * and graph — only `src` changes per chunk, so the single source node is
   * preserved.
   *
   * Chunk N+1 is fetched while chunk N plays, so synthesis overlaps playback
   * instead of adding a gap between sentences.
   *
   * Resolves as soon as the FIRST chunk starts playing (so the caller isn't
   * blocked for the length of the whole reply); the queue continues in the
   * background and calls onDone after the last chunk.
   */
  speakChunks(
    chunks: string[],
    hooks: { onStart?: () => void; onDone?: () => void }
  ): Promise<boolean> {
    this.build();
    const el = this.el;
    if (!el || chunks.length === 0) return Promise.resolve(false);

    this.cancel();                    // stop anything already speaking
    const gen = ++this.generation;
    const ac = new AbortController();
    this.inflight = ac;

    const fetchChunk = async (text: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ac.signal
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.size) return null;
        return URL.createObjectURL(blob);
      } catch {
        return null;                  // aborted or failed — never wedge the queue
      }
    };

    return new Promise<boolean>((resolve) => {
      let started = false;
      const settleStart = (ok: boolean) => {
        if (!started || ok) resolve(ok);
      };

      void (async () => {
        // Prime the pipeline with the first chunk.
        let pending: Promise<string | null> | null = fetchChunk(chunks[0]);

        for (let i = 0; i < chunks.length; i++) {
          if (gen !== this.generation) break;

          const url = await pending;
          if (gen !== this.generation) {
            if (url) URL.revokeObjectURL(url);
            break;
          }
          // Start fetching the NEXT chunk before playing this one.
          pending = i + 1 < chunks.length ? fetchChunk(chunks[i + 1]) : null;

          if (!url) {
            // This chunk failed to synthesise; skip it rather than stopping —
            // the text is fully on screen regardless.
            continue;
          }

          this.currentUrl = url;
          const ok = await this.playOne(url, () => {
            if (!started) {
              started = true;
              hooks.onStart?.();
              resolve(true);
            }
          });
          URL.revokeObjectURL(url);
          if (this.currentUrl === url) this.currentUrl = null;

          if (!ok || gen !== this.generation) break;
        }

        // Drain any pre-fetch that outlived the queue.
        if (pending) {
          const leftover = await pending;
          if (leftover) URL.revokeObjectURL(leftover);
        }

        if (gen === this.generation) {
          this.inflight = null;
          hooks.onDone?.();            // only the live queue hands back to idle
        }
        settleStart(started);
      })();
    });
  }

  /** Stop playback and detach handlers, without tearing down the graph. */
  stop(): void {
    const el = this.el;
    if (!el) return;
    el.onplay = null;
    el.onended = null;
    el.onerror = null;
    try {
      el.pause();
    } catch {
      /* ignore */
    }
  }

  /** Free the blob URL for the clip that just finished. */
  private release(): void {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  /**
   * Stop everything: invalidate the running queue, abort pending chunk
   * fetches, settle the awaited clip, and free the current blob. Called when a
   * new message is sent or voice is switched off mid-reply.
   */
  cancel(): void {
    this.generation++;               // stale queue sees this and bails
    this.inflight?.abort();
    this.inflight = null;
    this.stop();
    this.endCurrent?.(false);        // unblock the awaited chunk
    this.endCurrent = null;
    this.release();
  }

  /**
   * Sample the analyser. Returns null when there's nothing to read, which the
   * orb treats as "stay on the idle animation".
   */
  getFrame(): VoiceFrame | null {
    const analyser = this.analyser;
    if (!analyser || !this.graphOk) return null;

    analyser.getByteFrequencyData(this.freqData);
    analyser.getByteTimeDomainData(this.timeData);

    // RMS of the time-domain signal, centred on 128.
    let sumSq = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeData.length);

    const bins = this.freqData.length;
    const band = (from: number, to: number) => {
      const a = Math.max(0, Math.floor(from));
      const b = Math.min(bins, Math.ceil(to));
      if (b <= a) return 0;
      let sum = 0;
      for (let i = a; i < b; i++) sum += this.freqData[i];
      return sum / (b - a) / 255;
    };

    // Speech energy sits low; these ranges keep the bands visibly distinct.
    const low = band(1, 6);
    const mid = band(6, 28);
    const high = band(28, 72);

    // Log-ish bin mapping so low frequencies (where voice lives) get more bars.
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const t = i / (SPECTRUM_BINS - 1);
      const idx = Math.min(bins - 1, Math.floor(Math.pow(t, 1.7) * (bins - 1)));
      this.spectrum[i] = this.freqData[idx] / 255;
    }

    return {
      // A little gain: speech RMS rarely exceeds ~0.3.
      level: Math.min(1, rms * 2.6),
      low,
      mid,
      high,
      spectrum: this.spectrum
    };
  }
}

export const voiceAudio = new VoiceAudio();
export const VOICE_SPECTRUM_BINS = SPECTRUM_BINS;
