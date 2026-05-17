// OpenNext config for Cloudflare Workers deployment
// Docs: https://opennext.js.org/cloudflare

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Optional: enable incremental cache via Cloudflare KV
  // incrementalCache: kvIncrementalCache,
});
