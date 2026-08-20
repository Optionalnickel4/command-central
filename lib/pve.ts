import https from "https";

/**
 * Shared Proxmox client.
 *
 * Uses Node's https module directly rather than fetch/undici, so the
 * self-signed PVE cert bypass (rejectUnauthorized: false) is applied
 * reliably and per-request — no dependency on which undici instance
 * Next bundles. Scoped to these calls; TLS is never disabled globally.
 *
 * DO NOT rewrite this to fetch — see CLAUDE.md rule 1. undici ignores the
 * self-signed bypass and throws UND_ERR_INVALID_ARG, and the homelab panel
 * goes dark.
 */

export function pveConfig() {
  return {
    apiUrl: process.env.PROXMOX_API_URL,
    tokenId: process.env.PROXMOX_TOKEN_ID,
    tokenSecret: process.env.PROXMOX_TOKEN_SECRET
  };
}

export function hasPveCredentials(): boolean {
  const { apiUrl, tokenId, tokenSecret } = pveConfig();
  return Boolean(apiUrl && tokenId && tokenSecret);
}

export function pve(path: string, timeoutMs = 5000): Promise<any> {
  const { apiUrl, tokenId, tokenSecret } = pveConfig();
  return new Promise((resolve, reject) => {
    const url = new URL(`${apiUrl}/api2/json${path}`);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "GET",
        headers: { Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}` },
        rejectUnauthorized: false,
        timeout: timeoutMs
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body).data);
            } catch {
              reject(new Error(`bad JSON from ${path}`));
            }
          } else {
            reject(new Error(`PVE ${path} -> ${res.statusCode}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("PVE request timed out")));
    req.end();
  });
}
