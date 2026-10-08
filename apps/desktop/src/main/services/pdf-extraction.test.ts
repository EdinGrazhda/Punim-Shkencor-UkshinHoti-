import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { extractPdfText } from "./pdf-extraction.js";

afterEach(() => vi.unstubAllEnvs());

// Actual binary PDFs, including image-only pages. No mocked parser/OCR/network.
function fixturePdf(pages: Array<{ text?: string; image?: Buffer; rotation?: number }>) {
  const objects: Buffer[] = [];
  const add = (body: string | Buffer) => { objects.push(Buffer.from(body)); return objects.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const page of pages) {
    let image = 0;
    if (page.image) image = add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1200 /Height 1600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.image.length} >>\nstream\n`),
      page.image, Buffer.from("\nendstream"),
    ]));
    const commands = `${image ? "q 600 0 0 800 0 0 cm /Scan Do Q\n" : ""}${page.text ? `BT /F1 16 Tf 50 760 Td (${page.text}) Tj ET` : ""}`;
    const stream = add(`<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Rotate ${page.rotation ?? 0} /Resources << /Font << /F1 ${font} 0 R >> ${image ? `/XObject << /Scan ${image} 0 R >>` : ""} >> /Contents ${stream} 0 R >>`));
  }
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  const chunks = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  let length = chunks[0]!.length;
  for (const [i, object] of objects.entries()) {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]);
    chunks.push(chunk); length += chunk.length;
  }
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
  return new Uint8Array(Buffer.concat(chunks));
}

function scan(text: string[]) {
  const canvas = createCanvas(1200, 1600);
  const context = canvas.getContext("2d");
  context.fillStyle = "white"; context.fillRect(0, 0, 1200, 1600);
  context.fillStyle = "black"; context.font = "36px Arial";
  text.forEach((line, index) => context.fillText(line, 90, 240 + index * 70));
  return canvas.toBuffer("image/jpeg");
}

describe("PDF reading with local OCR", () => {
  it("reports missing local language packs without attempting a network download", async () => {
    vi.stubEnv("PDF_OCR_LANGUAGES", "zzz");
    vi.stubEnv("PDF_OCR_DATA_PATH", "");
    await expect(extractPdfText(fixturePdf([{ image: scan(["A scanned lesson."]) }]))).rejects.toThrow(/OCR language data for zzz/);
  });

  it("reads a scan and a mixed page without losing the scanned body behind its text header", async () => {
    const bytes = fixturePdf([
      { image: scan(["Water freezes at zero degrees Celsius.", "Ice is the solid form of water."]) },
      { text: "Digital page heading", image: scan(["Plants use sunlight for photosynthesis.", "Leaves absorb light using chlorophyll."]) },
      { text: "Final digital page: Earth orbits the Sun." },
    ]);
    const result = await extractPdfText(bytes);
    expect(result).toContain("Water freezes at zero degrees Celsius.");
    expect(result).toContain("Plants use sunlight for photosynthesis.");
    expect(result).toContain("Digital page heading");
    expect(result).toContain("Earth orbits the Sun.");
  }, 120_000);

  it("respects rotation metadata when extracting embedded text", async () => {
    // Rotation comes from PDF metadata, not an assumed upright scan.
    const text = await extractPdfText(fixturePdf([{ text: "Water freezes at zero degrees Celsius.", rotation: 90 }]));
    expect(text).toContain("Water freezes at zero degrees Celsius.");
  });

  it("reports invalid files and page limits clearly", async () => {
    await expect(extractPdfText(new TextEncoder().encode("not a PDF"))).rejects.toThrow(/damaged or invalid/);
    await expect(extractPdfText(fixturePdf(Array.from({ length: 501 }, () => ({ text: "A page" }))))).rejects.toThrow(/500 pages/);
  });
});
