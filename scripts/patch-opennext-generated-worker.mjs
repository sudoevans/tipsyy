import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDirectory = path.join(process.cwd(), ".open-next", "server-functions", "default");
const handlerPath = path.join(outputDirectory, "handler.mjs");
const previewPropsPath = path.join(outputDirectory, ".next", "server", "preview-props.json");
const manifestSuffix = "/server/preview-props.json";
const errorMarker = "throw new Error(`Unexpected loadManifest(${path2}) call!`)";

const [handler, previewPropsSource] = await Promise.all([
  readFile(handlerPath, "utf8"),
  readFile(previewPropsPath, "utf8"),
]);

// Next 16.4 loads this small manifest at runtime. Current OpenNext releases
// omit it from the generated worker lookup table, even though it is emitted.
const previewProps = JSON.stringify(JSON.parse(previewPropsSource));
const returnStatement = `if(path2.endsWith(${JSON.stringify(manifestSuffix)}))return ${previewProps};`;

if (handler.includes(returnStatement)) {
  process.exit(0);
}

if (!handler.includes(errorMarker)) {
  throw new Error("Unable to add the Next preview-props manifest to the generated Worker.");
}

await writeFile(handlerPath, handler.replace(errorMarker, `${returnStatement}${errorMarker}`));
process.stdout.write("Added the Next preview-props manifest to the generated Worker.\n");
