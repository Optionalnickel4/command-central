import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

/**
 * Unit tests only — pure logic under lib/ and the small pure helpers the API
 * routes were factored into. No DOM, no component rendering, no network: the
 * node environment is all these need, and keeping it that way is what stops a
 * "quick test" from ever reaching Proxmox, 152 or vlr-api.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    // Mirrors tsconfig's "@/*" -> "./*" so tests import modules exactly the way
    // the app does.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) }
  }
});
