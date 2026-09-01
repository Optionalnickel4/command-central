"use client";

import { useState, useRef, useEffect } from "react";
import { BACKEND_LABEL, useSolState, type AssistantBackend } from "@/components/sol-state";
import { chunkForSpeech, voiceAudio } from "@/lib/voice-audio";
import WriteProposal, { type WriteState } from "@/components/vault/write-proposal";
import { detectDurableFact, parseLogRequest, type Proposal } from "@/lib/vault-write";
import type { VaultIndex } from "@/app/api/vault/route";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Present on a proposed vault write, which renders as a confirm card. */
  proposal?: Proposal;
  writeState?: WriteState;
}

/**
 * The core console — Sol's chat, sitting directly beneath the orb.
 * The transport is untouched: same POST to /api/chat, which SSHes to
 * OpenClaw. What's new is that each turn publishes Sol's state so the orb
 * spins up while thinking and pulses while a reply lands.
 */
export default function AssistantPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Systems online. Ask me anything about the board." }
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { setState: setSolState, registerSubmit, backend, setBackend } = useSolState();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- voice out ---------------------------------------------------------
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceOffline, setVoiceOffline] = useState(false);

  // --- voice in (push-to-talk) -------------------------------------------
  // Speech recognition requires a secure context. Under plain HTTP this stays
  // false and the mic renders deliberately disabled rather than broken.
  const [micReady, setMicReady] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // The vault's note names, so "log to vlr-api" can be resolved against what
  // actually exists. One fetch; the list changes when someone adds a note.
  const [projects, setProjects] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/vault")
      .then((r) => r.json() as Promise<VaultIndex>)
      .then((j) => {
        if (!cancelled && Array.isArray(j?.projects)) setProjects(j.projects);
      })
      .catch(() => {
        /* no vault, no proposals — chat is unaffected */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Append a proposal card to the log, awaiting the user's click. */
  function propose(proposal: Proposal) {
    setMessages((m) => [
      ...m,
      { role: "assistant", content: "", proposal, writeState: "pending" }
    ]);
  }

  /** The card reports back what happened; the transcript records it. */
  function settleProposal(index: number, state: WriteState) {
    setMessages((m) => m.map((msg, i) => (i === index ? { ...msg, writeState: state } : msg)));
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setMicReady(Boolean(window.isSecureContext && SR));
  }, []);

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    stopAudio();
  }, []);

  /** Stop and release any in-flight narration. */
  function stopAudio() {
    voiceAudio.cancel();
  }

  /**
   * Narrate a reply. Resolves true only if audio actually started, so the
   * caller knows whether playback owns the orb's "speaking" state or whether
   * the timer fallback should.
   *
   * Any failure here is silent by design — the text reply already landed.
   */
  async function speak(text: string): Promise<boolean> {
    if (!voiceOn || !text.trim()) return false;
    // The WHOLE reply is spoken: split into sentence-sized chunks and queued.
    const chunks = chunkForSpeech(text);
    if (chunks.length === 0) return false;
    try {
      // Playback runs through the shared Web Audio graph so the orb can read
      // the analyser. The orb lights on the FIRST chunk and stays speaking
      // across chunk boundaries — idle is handed back only after the last one,
      // so a multi-sentence reply doesn't stutter between sentences.
      const started = await voiceAudio.speakChunks(chunks, {
        onStart: () => {
          if (idleTimer.current) clearTimeout(idleTimer.current);
          setSolState("speaking");
        },
        onDone: () => setSolState("idle")
      });
      if (!started) setVoiceOffline(true);
      return started;
    } catch {
      setVoiceOffline(true);
      return false;
    }
  }

  // Expose this console's send to the command bar. Held through a ref so the
  // registered function is always the current render's closure.
  const sendRef = useRef<((text?: string) => void) | null>(null);
  sendRef.current = send;
  useEffect(() => {
    registerSubmit((text: string) => sendRef.current?.(text));
    return () => registerSubmit(null);
  }, [registerSubmit]);

  /** Hold a state for a beat, then settle back to idle. */
  function settle(after: number) {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setSolState("idle"), after);
  }

  /**
   * Push-to-talk. Drops the transcript into the input and sends it through
   * the SAME send() path as typing — no second route to the backends.
   * Only reachable when micReady (secure context + API present).
   */
  function toggleMic() {
    if (!micReady || pending) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setInput(transcript);
        send(transcript);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  /** `textArg` lets the command bar submit through this same path. */
  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || pending) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    if (textArg === undefined) setInput("");

    // "log to vlr-api: ..." is a COMMAND, not a question. It is parsed here,
    // deterministically, and never sent to a backend: the model is not asked
    // whether to write, cannot be talked into writing, and cannot invent the
    // text. It only ever becomes a proposal the user must confirm.
    const explicit = parseLogRequest(text, projects);
    if (explicit) {
      propose(explicit);
      setSolState("idle");
      return;
    }

    // The offered path: the user stated a durable project fact in passing
    // ("vlr-api moved to 10.0.0.21"), so offer to record it once their answer
    // lands. Decided HERE, from the user's own words — inside the try below,
    // `text` is rebound to the model's reply, and an offer must never be
    // something the backend can talk us into. Costs no tokens either.
    const offered = detectDurableFact(text, projects);

    setPending(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // A new question cancels whatever the core was still saying.
    stopAudio();
    // Sending is a user gesture — the moment to unsuspend the AudioContext, or
    // the first reply would be silently blocked by autoplay policy.
    if (voiceOn) void voiceAudio.resume();
    setSolState("thinking");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Proposal cards are UI, not transcript — sending them would ask the
        // model to reason about a write it has no part in.
        body: JSON.stringify({
          messages: next.filter((m) => !m.proposal).map(({ role, content }) => ({ role, content })),
          backend
        })
      });
      // A backend failure is a 502 now, but its body still carries the
      // backend's OWN last line in `reply` — which is the diagnosable part, and
      // far more use than "backend unreachable". Prefer it; fall back to the
      // generic message only when there is no readable body at all.
      const payload = await res.json().catch(() => null);
      const reply = payload?.reply;
      if (typeof reply !== "string") throw new Error(`${res.status}`);
      const text = String(reply ?? "");
      setMessages((m) => [...m, { role: "assistant", content: reply }]);

      // With voice on, the core stays "thinking" through synthesis and only
      // lights up when audio actually starts — playback owns the speaking
      // state end to end. Starting a timed pulse here instead produced a
      // visible double-blink: a short pulse, a gap while Piper synthesised,
      // then a second pulse when the audio began.
      const narrating = voiceOn ? await speak(text) : false;
      if (!narrating) {
        // Voice off, unavailable, or autoplay-blocked: timed pulse as before.
        setSolState("speaking");
        settle(Math.min(4000, 900 + text.length * 18));
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `◇ ${BACKEND_LABEL[backend]} backend unreachable.` }
      ]);
      // Leave the core in its alarm state — the link really is down.
      setSolState("error");
    } finally {
      setPending(false);
      // Surfaced after the turn settles, whichever way it went. The fact is
      // the USER's, not the model's, so a slow or unreachable backend must not
      // swallow the offer — it is not contingent on an answer arriving.
      if (offered) propose(offered);
    }
  }

  return (
    <div className="core-console mt-3 w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="flex-1 hud-rule" />
        <span className="px-3 font-mono text-[8.5px] uppercase tracking-[0.34em] text-cyan-500/45">
          Core Console
        </span>
        <span className="flex-1 hud-rule" style={{ transform: "scaleX(-1)" }} />
      </div>

      {/* Backend selector + voice toggle. */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = !voiceOn;
              setVoiceOn(next);
              if (!next) {
                stopAudio();
                setSolState("idle");
              }
            }}
            aria-pressed={voiceOn}
            title={voiceOn ? "Voice output on" : "Voice output off"}
            className={`voice-toggle ${voiceOn ? "is-on" : ""}`}
          >
            <span aria-hidden="true">{voiceOn ? "◂))" : "◂✕"}</span>
            <span>{voiceOn ? "Voice" : "Muted"}</span>
          </button>
          {voiceOffline && voiceOn && (
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-300/70">
              voice offline
            </span>
          )}
        </div>

        <div className="backend-seg" role="group" aria-label="Assistant backend">
          {(["sol", "claude"] as AssistantBackend[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBackend(b)}
              aria-pressed={backend === b}
              className={`backend-opt ${backend === b ? "is-active" : ""}`}
            >
              {BACKEND_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex flex-col gap-2 mb-2.5 overflow-y-auto core-console-log"
      >
        {messages.map((m, i) =>
          m.proposal ? (
            <WriteProposal
              key={i}
              proposal={m.proposal}
              state={m.writeState ?? "pending"}
              onSettled={(state) => settleProposal(i, state)}
            />
          ) : (
            <div
              key={i}
              className={`font-mono text-[12.5px] leading-relaxed rounded px-3 py-2 max-w-[92%] whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end bg-cyan-500/10 border border-cyan-500/30 text-cyan-100"
                  : "self-start bg-slate-900/50 border border-slate-700/40 text-slate-200"
              }`}
              style={m.role === "user" ? { boxShadow: "0 0 14px rgba(34,211,238,0.10)" } : undefined}
            >
              {m.content}
            </div>
          )
        )}
        {pending && (
          <div className="self-start flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-400/60 px-3 py-1">
            <span className="live-pulse">Processing</span>
            <span className="flex gap-1">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="inline-block h-1 w-1 rounded-full bg-cyan-400 live-pulse"
                  style={{ animationDelay: `${d * 0.22}s`, boxShadow: "0 0 5px #22d3ee" }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleMic}
          disabled={!micReady || pending}
          aria-label={micReady ? "Push to talk" : "Voice input unavailable"}
          title={
            micReady
              ? "Push to talk"
              : "Voice input needs HTTPS — available once the dashboard is served securely."
          }
          className={`mic-btn ${listening ? "is-listening" : ""} ${micReady ? "" : "is-gated"}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4" strokeLinecap="round" />
          </svg>
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={listening ? "listening…" : "> query sol"}
          className="flex-1 min-w-0 bg-slate-900/60 border border-cyan-500/30 rounded px-3 py-2 font-mono text-[12.5px] text-cyan-100 placeholder:text-cyan-500/30 focus:outline-none focus:border-cyan-400/60"
          style={{ boxShadow: "inset 0 0 10px rgba(34,211,238,0.05)" }}
        />
        <button
          onClick={() => send()}
          disabled={pending}
          className="px-3 rounded border border-cyan-400/40 bg-cyan-500/10 font-mono text-[10.5px] uppercase tracking-wider hud-glow-text hover:bg-cyan-500/20 disabled:opacity-40 shrink-0"
          aria-label="Send"
        >
          Send
        </button>
      </div>
    </div>
  );
}
