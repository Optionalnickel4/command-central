import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { NextRequest, NextResponse } from "next/server";

type AuthMode = "cloudflare-access" | "trusted-network" | "off";

function authMode(): AuthMode {
  const configured = process.env.APP_AUTH_MODE;
  if (configured === "cloudflare-access" || configured === "trusted-network" || configured === "off") {
    return configured;
  }
  // Production must opt out deliberately. Development stays frictionless.
  return process.env.NODE_ENV === "production" ? "cloudflare-access" : "off";
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksIssuer = "";

function accessConfig(): { issuer: string; audience: string } | null {
  const raw = process.env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = process.env.CF_ACCESS_AUD?.trim();
  if (!raw || !audience) return null;
  const issuer = raw.startsWith("https://") ? raw.replace(/\/+$/, "") : `https://${raw.replace(/\/+$/, "")}`;
  return { issuer, audience };
}

async function verifyAccess(req: NextRequest): Promise<JWTPayload | null> {
  const config = accessConfig();
  if (!config) return null;
  const token = req.headers.get("cf-access-jwt-assertion") ?? req.cookies.get("CF_Authorization")?.value;
  if (!token) return null;

  if (!jwks || jwksIssuer !== config.issuer) {
    jwksIssuer = config.issuer;
    jwks = createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`));
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience
    });
    return payload;
  } catch {
    return null;
  }
}

function secured(response: NextResponse): NextResponse {
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("content-security-policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return response;
}

export async function proxy(req: NextRequest) {
  const mode = authMode();
  if (mode === "cloudflare-access") {
    if (!accessConfig()) {
      return secured(NextResponse.json({ error: "authentication is not configured" }, { status: 503 }));
    }
    const payload = await verifyAccess(req);
    if (!payload) return secured(NextResponse.json({ error: "unauthorized" }, { status: 401 }));

    const headers = new Headers(req.headers);
    const identity = typeof payload.email === "string" ? payload.email : payload.sub;
    if (identity) headers.set("x-command-central-user", identity);
    return secured(NextResponse.next({ request: { headers } }));
  }

  return secured(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
