import { NextRequest, NextResponse } from "next/server";
import { STATE_COOKIE, exchangeCode } from "@/lib/google-calendar";

// Handles a live redirect carrying a one-time code; never prerender it.
export const dynamic = "force-dynamic";

/** Escape everything interpolated into the page below — including the token. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A minimal HUD-styled page. This route is hit once, in a browser, outside the
 * dashboard shell, so it carries its own styles rather than pulling in the app
 * chrome.
 *
 * Always no-store: the successful variant has a refresh token in the body and
 * must not sit in a cache, a proxy, or the back/forward cache.
 */
function page(title: string, bodyHtml: string, status: number): NextResponse {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<style>
  body { background:#030711; color:#e2e8f0; font:14px/1.6 ui-monospace,"JetBrains Mono",monospace;
         margin:0; padding:2.5rem 1.25rem; display:flex; justify-content:center; }
  main { width:100%; max-width:46rem; }
  h1 { font-size:.78rem; letter-spacing:.28em; text-transform:uppercase; color:#22d3ee;
       margin:0 0 1.25rem; }
  .panel { border:1px solid rgba(34,211,238,.25); border-radius:.25rem; padding:1.25rem;
           background:rgba(34,211,238,.04); }
  code, pre { background:#0b1220; border:1px solid rgba(34,211,238,.2); border-radius:.25rem; }
  code { padding:.1rem .35rem; }
  pre { padding:.9rem; overflow-x:auto; white-space:pre-wrap; word-break:break-all;
        color:#34d399; margin:1rem 0; }
  p { color:#94a3b8; } strong { color:#e2e8f0; }
  .warn { color:#fbbf24; } .err { color:#f43f5e; }
  ol { color:#94a3b8; padding-left:1.2rem; } li { margin:.4rem 0; }
</style></head>
<body><main><h1>Command Central · Calendar</h1><div class="panel">${bodyHtml}</div></main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0" }
  });
}

/**
 * Step two of the one-time token mint: Google redirects here with ?code=, which
 * is exchanged for a refresh token and shown ONCE for the user to paste into
 * .env.local.
 *
 * Displaying it is the right call for a single-user personal setup: the
 * alternative is this service writing a credential to disk on its own. It is
 * never logged and never persisted — the only copy is the one the user pastes.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const oauthError = params.get("error");
  if (oauthError) {
    // e.g. access_denied when the consent screen is dismissed.
    return page(
      "Calendar — not connected",
      `<p class="err">Google returned <strong>${esc(oauthError)}</strong>.</p>
       <p>Nothing was changed. Start again at <code>/api/calendar/connect</code>.</p>`,
      400
    );
  }

  const code = params.get("code");
  if (!code) {
    return page(
      "Calendar — no code",
      `<p class="err">No authorization code in the callback.</p>
       <p>Start the flow at <code>/api/calendar/connect</code> rather than opening this URL directly.</p>`,
      400
    );
  }

  // The state cookie was set by the connect route in this browser; a mismatch
  // means this callback didn't come from a flow started here.
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!expected || params.get("state") !== expected) {
    return page(
      "Calendar — state mismatch",
      `<p class="err">The callback's state didn't match this browser's.</p>
       <p>This happens if the flow was started elsewhere, or if it sat longer than
          ten minutes. Start again at <code>/api/calendar/connect</code>.</p>`,
      400
    );
  }

  try {
    const { refreshToken, scope } = await exchangeCode(code);

    if (!refreshToken) {
      // The classic trap: Google withholds the refresh token on a repeat
      // authorisation unless prompt=consent forces it. buildAuthUrl sends both
      // access_type=offline and prompt=consent, so this should not happen.
      return page(
        "Calendar — no refresh token",
        `<p class="warn">Google returned an access token but no refresh token.</p>
         <p>That happens when the consent flow omits <code>access_type=offline</code> and
            <code>prompt=consent</code>. Both are sent by this app, so try once more from
            <code>/api/calendar/connect</code>; if it recurs, revoke this app's access at
            <code>myaccount.google.com/permissions</code> and reconnect.</p>`,
        502
      );
    }

    const res = page(
      "Calendar — connected",
      `<p><strong>Refresh token minted.</strong> Copy it into
          <code>.env.local</code> on LXC 220 — it is shown once and is not stored anywhere.</p>
       <pre>GOOGLE_CALENDAR_REFRESH_TOKEN=${esc(refreshToken)}</pre>
       <ol>
         <li>Paste the line above into <code>/home/builder/command-central/.env.local</code>.</li>
         <li><code>sudo systemctl restart command-central</code>.</li>
         <li>The calendar panel switches from "not connected" to your events.</li>
       </ol>
       <p>Granted scope: <code>${esc(scope ?? "unknown")}</code> — read-only.</p>
       <p class="warn">Treat this like a password. Don't paste it into a file that gets committed.</p>`,
      200
    );
    // The state is single-use; clear it so the page can't be replayed.
    res.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: true, path: "/api/calendar", maxAge: 0 });
    return res;
  } catch (err) {
    // Status only — never the body, which can echo the credential back.
    console.error("calendar token exchange failed:", err instanceof Error ? err.message : err);
    return page(
      "Calendar — exchange failed",
      `<p class="err">The token exchange with Google failed.</p>
       <p>The usual cause is a <code>redirect_uri_mismatch</code>: the Authorized redirect URI on the
          OAuth client must match this app's callback character-for-character (https, no trailing
          slash). Check the service log for the status code, then retry from
          <code>/api/calendar/connect</code>.</p>`,
      502
    );
  }
}
