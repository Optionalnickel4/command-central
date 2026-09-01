import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const original = {
  mode: process.env.APP_AUTH_MODE,
  team: process.env.CF_ACCESS_TEAM_DOMAIN,
  audience: process.env.CF_ACCESS_AUD
};

afterEach(() => {
  if (original.mode === undefined) delete process.env.APP_AUTH_MODE;
  else process.env.APP_AUTH_MODE = original.mode;
  if (original.team === undefined) delete process.env.CF_ACCESS_TEAM_DOMAIN;
  else process.env.CF_ACCESS_TEAM_DOMAIN = original.team;
  if (original.audience === undefined) delete process.env.CF_ACCESS_AUD;
  else process.env.CF_ACCESS_AUD = original.audience;
});

describe("production authentication proxy", () => {
  it("fails closed when Cloudflare Access identifiers are missing", async () => {
    process.env.APP_AUTH_MODE = "cloudflare-access";
    delete process.env.CF_ACCESS_TEAM_DOMAIN;
    delete process.env.CF_ACCESS_AUD;

    const response = await proxy(new NextRequest("https://jarvis.example/api/chat"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "authentication is not configured" });
  });

  it("allows an explicitly trusted-network deployment", async () => {
    process.env.APP_AUTH_MODE = "trusted-network";
    const response = await proxy(new NextRequest("https://jarvis.example/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});
