import type {} from "@cloudflare/vitest-plugin/types";
declare module "cloudflare:workers" {
  // Cloudflare's test API uses interface augmentation for generated bindings.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends CloudflareEnv {}
}
