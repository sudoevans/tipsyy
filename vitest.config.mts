import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "checkout-client", environment: "node", include: ["tests/client/*.test.ts"] },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "./tests/workers/wrangler.jsonc" } })],
        test: { name: "payment-websockets", include: ["tests/workers/*.test.ts"] },
      },
    ],
  },
});
