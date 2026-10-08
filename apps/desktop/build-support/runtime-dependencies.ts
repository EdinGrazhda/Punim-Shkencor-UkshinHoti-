import { cp, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// Forge's Vite plugin normally copies only .vite. These Node-only packages have
// workers/native/WASM assets and cannot be flattened into the main JS bundle.
export async function copyPdfRuntimeDependencies(buildPath: string) {
  const copied = new Map<string, string>();
  async function copy(name: string, from: string, optional = false): Promise<void> {
    let manifest: string;
    try { manifest = createRequire(from).resolve(`${name}/package.json`); }
    catch (error) { if (optional) return; throw error; }
    const root = path.dirname(manifest);
    const previous = copied.get(name);
    if (previous) {
      if (previous !== root) throw new Error(`Conflicting PDF runtime dependency versions for ${name}.`);
      return;
    }
    copied.set(name, root);
    const target = path.join(buildPath, "node_modules", name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(root, target, { recursive: true, dereference: true, filter: source => path.relative(root, source).split(path.sep)[0] !== "node_modules" });
    const metadata = JSON.parse(await readFile(manifest, "utf8")) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    const optionalDependencies = metadata.optionalDependencies ?? {};
    for (const dependency of Object.keys(metadata.dependencies ?? {})) {
      await copy(dependency, manifest, dependency in optionalDependencies);
    }
    for (const dependency of Object.keys(optionalDependencies)) await copy(dependency, manifest, true);
  }
  for (const name of ["pdfjs-dist", "@napi-rs/canvas", "tesseract.js", "@tesseract.js-data/eng"]) {
    await copy(name, import.meta.url);
  }
}
