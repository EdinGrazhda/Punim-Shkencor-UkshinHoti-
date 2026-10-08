import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Read only the packaged dependency closure, not the workspace's node_modules.
const resources = path.resolve(process.argv[2] ?? "apps/desktop/out/@ckadinti-desktop-win32-x64/resources");
const require = createRequire(path.join(resources, "app.asar.unpacked", "package.json"));
const resolve = name => {
  const filename = require.resolve(name);
  assert.ok(filename.startsWith(path.join(resources, "app.asar.unpacked")), `Not packaged: ${name}`);
  return filename;
};
const { getDocument } = await import(pathToFileURL(resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
const pdfRoot = path.dirname(resolve("pdfjs-dist/package.json")).replaceAll("\\", "/");
const loading = getDocument({
  data: new Uint8Array(await readFile("output/pdf/CkaDinTi_HTML_Lesson.pdf")),
  cMapUrl: `${pdfRoot}/cmaps/`, cMapPacked: true,
  standardFontDataUrl: `${pdfRoot}/standard_fonts/`, wasmUrl: `${pdfRoot}/wasm/`,
});
try {
  const pdf = await loading.promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  assert.ok(content.items.some(item => "str" in item && item.str.includes("HTML")));
} finally { await loading.destroy(); }
const { createCanvas } = require(resolve("@napi-rs/canvas"));
const canvas = createCanvas(900, 180);
const context = canvas.getContext("2d");
context.fillStyle = "white"; context.fillRect(0, 0, 900, 180);
context.fillStyle = "black"; context.font = "32px Arial";
context.fillText("Water freezes at zero degrees Celsius.", 35, 95);
const { createWorker } = require(resolve("tesseract.js"));
const worker = await createWorker("eng", 1, {
  workerPath: resolve("tesseract.js/src/worker-script/node/index.js"),
  langPath: path.join(path.dirname(resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int"),
  cacheMethod: "none", errorHandler: () => {},
});
try {
  const result = await worker.recognize(canvas.toBuffer("image/png"));
  assert.ok(result.data.text.includes("Water freezes at zero degrees Celsius."));
} finally { await worker.terminate(); }
console.log("PASS: packaged PDF parser, native canvas, OCR worker, WASM and English language data.");
