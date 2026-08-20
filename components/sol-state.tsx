"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Shared Sol presence state. The assistant console publishes it as a chat
 * turn moves through its lifecycle; the core orb renders it. Kept in context
 * so the two can sit in different branches of the cockpit layout.
 *
 * This is presentation state only — it never touches the SSH transport.
 */
export type SolState = "idle" | "thinking" | "speaking" | "error";

/** Which assistant answers. Mirrors AssistantBackend in the chat route. */
export type AssistantBackend = "sol" | "claude";

export const BACKEND_LABEL: Record<AssistantBackend, string> = {
  sol: "Sol",
  claude: "Claude"
};

const SolStateContext = createContext<{
  state: SolState;
  setState: (next: SolState) => void;
  /** Called by the console to expose its send function to the command bar. */
  registerSubmit: (fn: ((text: string) => void) | null) => void;
  /** Route text to the active backend through the console's existing send path. */
  submit: (text: string) => void;
  /** Which backend answers — shared so the orb can label itself. */
  backend: AssistantBackend;
  setBackend: (next: AssistantBackend) => void;
} | null>(null);

export function SolStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SolState>("idle");
  // Claude by default — the backend verified working on this box.
  const [backend, setBackend] = useState<AssistantBackend>("claude");
  // A ref, not state: the console registers once and the command bar reads
  // through it, so neither re-renders the other.
  const submitRef = useRef<((text: string) => void) | null>(null);

  const registerSubmit = useCallback((fn: ((text: string) => void) | null) => {
    submitRef.current = fn;
  }, []);
  const submit = useCallback((text: string) => {
    submitRef.current?.(text);
  }, []);

  const value = useMemo(
    () => ({ state, setState, registerSubmit, submit, backend, setBackend }),
    [state, registerSubmit, submit, backend]
  );
  return <SolStateContext.Provider value={value}>{children}</SolStateContext.Provider>;
}

export function useSolState() {
  const ctx = useContext(SolStateContext);
  if (!ctx) throw new Error("useSolState must be used inside <SolStateProvider>");
  return ctx;
}

export const SOL_LABEL: Record<SolState, string> = {
  idle: "Online · Standby",
  thinking: "Processing query",
  speaking: "Transmitting",
  error: "Link unreachable"
};
