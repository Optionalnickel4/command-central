# FIX SOL REPLY TRUNCATION — dashboard is showing only the first word

THE BUG: Sol has been fine all along. Diagnosed directly on LXC 152:
`openclaw agent -m "In two sentences, what is ZFS?" --json --session-id diag-test`
returns a FULL correct answer. But the dashboard was displaying "In." — the first
word only. So /api/chat is TRUNCATING Sol's reply when it extracts the text. Every
Sol answer shown in the dashboard has been cut to a fragment. This ALSO fed wrong
data to the TTS, the orb, and the usage graphs.

THE REAL SOL JSON SHAPE (captured live — build the parser to THIS, don't guess):

```json
{
  "runId": "...",
  "status": "ok",
  "summary": "completed",
  "result": {
    "payloads": [
      { "text": "ZFS is a combined filesystem and storage-management system ... protection against silent data corruption.", "mediaUrl": null }
    ],
    "meta": {
      "durationMs": 6502,
      "agentMeta": {
        "provider": "openai", "model": "gpt-5.6-sol",
        "contextTokens": 372000,
        "usage": { "input": 16774, "output": 51, "total": 16825 },
        "lastCallUsage": { "input": 16774, "output": 51, "cacheRead": 0, "cacheWrite": 0, "total": 16825 },
        "promptTokens": 16774
      }
    }
  }
}
```

The full reply is result.payloads[] — each entry's .text. If there are multiple
payloads, JOIN their .text (in order, with newlines) — don't take only [0] and
don't split on "." or sentences.

## WHAT TO DO

1. Find where the Sol backend response is parsed in app/api/chat/route.ts (and any
   helper in lib/sol.ts). Identify the truncation — likely one of: splitting the
   text on "." and taking [0], taking the first sentence/line, a .split(...)[0],
   or reading a wrong/shallow field. Print/log the raw parsed object first to be
   sure what it's doing.
2. Fix extraction to return the FULL text: concatenate all result.payloads[].text
   (filter out null/empty, join with "\n"). Keep returning the same {reply} shape
   the UI expects. Trim leading/trailing whitespace only — never mid-content.
3. Check the CLAUDE backend path too — make sure it's NOT similarly truncated
   (claude -p returns plain stdout; confirm the whole stdout is used, not a first
   line/sentence).
4. USAGE META: while here, confirm the usage graph reads output tokens from
   result.meta.agentMeta.usage.output (51 in the sample), NOT from a count of the
   truncated text. The earlier "6-7 output tokens every turn" was the truncation
   bug bleeding into the metrics — verify the number now matches the agentMeta.

## VERIFY (Sol answers now, so you can test end-to-end)

- Send Sol "In two sentences, what is ZFS?" through the dashboard and confirm the
  FULL two-sentence answer renders (not "In.").
- With voice on, confirm the whole answer is now spoken (chunking finally has real
  text) and the orb reacts across it.
- Confirm the usage graph's output-token value for that turn matches agentMeta
  (~51), not ~6.
- Build passes, no console errors, /sol + dashboard + esports + homelab still fine.
- Screenshot the chat with a full Sol reply visible.

## CONSTRAINTS

Dashboard-side only. Don't touch the SSH transport, the wrappers, Sol/OpenClaw
config (Sol is healthy — the bug is purely the reply parsing on 220).

Fix it, verify with a real Sol turn, then STOP and report — include the before
(what the truncation was) and after (the fix).
