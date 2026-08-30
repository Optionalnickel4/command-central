import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { REDIRECT_URI, STATE_COOKIE, buildAuthUrl, hasOAuthClient } from "@/lib/google-calendar";

// This route builds a URL from env and issues a redirect; nothing about it may
// be prerendered.
export const dynamic = "force-dynamic";

/**
 * Step one of the one-time token mint: send the user to Google's consent screen.
 *
 * The user reaches this from the dashboard while already Cloudflare
 * Access-authenticated, so their Access session cookie is still present when
 * Google redirects back to the callback.
 */
export async function GET() {
  if (!hasOAuthClient()) {
    return NextResponse.json(
      {
        error: "calendar OAuth client not configured",
        detail:
          "Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in .env.local first. " +
          `Register ${REDIRECT_URI} as the OAuth client's Authorized redirect URI.`
      },
      { status: 404 }
    );
  }

  // Binds this browser to the callback it gets back, so a code minted by
  // somebody else's flow can't be walked into this instance.
  const state = randomBytes(16).toString("hex");

  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/calendar",
    maxAge: 600
  });
  return res;
}
