import { createRequire } from "node:module";
import { access } from "node:fs/promises";
import path from "node:path";
import { MAX_LESSON_TEXT_CHARS } from "@ckadinti/contracts";
import type { Worker } from "tesseract.js";

const require = createRequire(import.meta.url);
const MAX_PDF_PAGES = 500;
const MAX_RENDER_PIXELS = 12_000_000;

// Native modules, workers and WASM must live outside Electron's ASAR archive.
function diskPath(value: string) {
  return value.replace(/app\.asar([\\/])/u, "app.asar.unpacked$1");
}

async function createOcrWorker() {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const languages = (process.env.PDF_OCR_LANGUAGES?.trim() || "eng").split("+");
  if (languages.some(language => !/^[a-z]{3}(?:_[a-zA-Z]+)?$/u.test(language))) {
    throw new Error("PDF_OCR_LANGUAGES must contain Tesseract language codes, for example eng+sqi.");
  }
  // Resolve local packs before starting a worker. Never fetch language data or
  // send PDF pixels to a remote OCR service.
  const english = path.dirname(require.resolve("@tesseract.js-data/eng/package.json"));
  const languagePath = diskPath(process.env.PDF_OCR_DATA_PATH?.trim() || path.join(english, "4.0.0_best_int"));
  await Promise.all(languages.map(async code => {
    try { await access(path.join(languagePath, `${code}.traineddata.gz`)); }
    catch { throw new Error(`OCR language data for ${code} could not be read. Check PDF_OCR_DATA_PATH.`); }
  }));
  const worker = await createWorker(languages.join("+"), OEM.LSTM_ONLY, {
    workerPath: diskPath(require.resolve("tesseract.js/src/worker-script/node/index.js")),
    langPath: languagePath, cacheMethod: "none",
    // Tesseract rejects the recognition promise; don't also crash the process.
    errorHandler: () => {},
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: "150" });
  return worker;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const assetRoot = diskPath(path.dirname(require.resolve("pdfjs-dist/package.json"))).replace(/\\/gu, "/");
  const loading = getDocument({
    data: bytes,
    cMapUrl: `${assetRoot}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetRoot}/standard_fonts/`,
    wasmUrl: `${assetRoot}/wasm/`,
    useSystemFonts: false,
  });
  let ocr: Worker | undefined;
  try {
    const document = await loading.promise;
    if (document.numPages > MAX_PDF_PAGES) throw new Error("PDFs must have 500 pages or fewer. Import a smaller section.");
    const pages: string[] = [];
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        let text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
        const operators = await page.getOperatorList();
        const imageOperations = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat,
          OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectGroup, OPS.paintInlineImageXObjectGroup, OPS.paintImageMaskXObjectRepeat];
        const hasImages = operators.fnArray.some(op => imageOperations.includes(op));
        // A text header must not hide a scanned body: inspect mixed pages too.
        if (hasImages || !text || process.env.PDF_OCR_FORCE === "true") {
          ocr ??= await createOcrWorker();
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2.5, Math.sqrt(MAX_RENDER_PIXELS / (base.width * base.height)));
          const viewport = page.getViewport({ scale });
          const { createCanvas } = await import("@napi-rs/canvas");
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvas: null, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport }).promise;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const result = await Promise.race([
            ocr.recognize(canvas.toBuffer("image/png"), { rotateAuto: true }),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`OCR timed out on PDF page ${pageNumber}. Try a clearer scan.`)), 90_000); }),
          ]).finally(() => { if (timer) clearTimeout(timer); canvas.width = 1; canvas.height = 1; });
          const recognized = result.data.text.trim();
          if (!recognized && !text && hasImages) throw new Error(`No readable text on PDF page ${pageNumber}. Use a clearer scan or the correct OCR language; image-only diagrams cannot supply quiz facts.`);
          if (recognized) {
            const compact = (value: string) => value.replace(/\s+/gu, " ").trim();
            if (!text || compact(recognized).includes(compact(text))) text = recognized;
            else if (!compact(text).includes(compact(recognized))) text += `\n\n${recognized}`;
          }
        }
        characters += text.length + 2;
        if (characters > MAX_LESSON_TEXT_CHARS) throw new Error("Extracted lesson text exceeds the 2,000,000 character limit. Import a smaller section.");
        if (text) pages.push(text);
      } finally { page.cleanup(); }
    }
    return pages.join("\n\n");
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new Error("This PDF is password-protected. Import an unlocked copy.");
    if (error instanceof Error && error.name === "InvalidPDFException") throw new Error("This PDF is damaged or invalid. Export a new PDF and try again.");
    throw error;
  } finally {
    await ocr?.terminate();
    await loading.destroy();
  }
}
