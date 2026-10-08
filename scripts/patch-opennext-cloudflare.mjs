import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const target = path.join(
  process.cwd(),
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "build",
  "patches",
  "plugins",
  "load-manifest.js",
);
const expected = "**/{*-manifest,required-server-files,prefetch-hints}.json";
const replacement = "**/{*-manifest,required-server-files,prefetch-hints,preview-props}.json";
const source = await readFile(target, "utf8");

if (source.includes(replacement)) {
  process.exit(0);
}

if (!source.includes(expected)) {
  throw new Error("Unable to apply the OpenNext preview-props manifest compatibility patch.");
}

await writeFile(target, source.replace(expected, replacement));
process.stdout.write("Applied OpenNext preview-props manifest compatibility patch.\n");
