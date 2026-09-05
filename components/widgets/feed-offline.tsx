import { PanelFailure, PanelFrame } from "./panel-state";

/**
 * Shared degraded state for esports widgets. vlr-api runs on another box, so
 * every widget needs a calm HUD-styled failure rather than a crash or a blank.
 * Mirrors the homelab panel's "SIGNAL LOST" treatment.
 */
export default function FeedOffline({ label = "Feed" }: { label?: string }) {
  return (
    <PanelFrame><PanelFailure source={label} /></PanelFrame>
  );
}
