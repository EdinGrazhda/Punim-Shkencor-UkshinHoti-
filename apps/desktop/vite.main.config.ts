import { defineConfig } from "vite";

export default defineConfig({
  build: { rollupOptions: { external: ["electron", /^pdfjs-dist(?:\/|$)/, "tesseract.js", "@napi-rs/canvas"] } },
});
