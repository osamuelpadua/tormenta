import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Keep the downloadable backup identical to the bundled example character.
mkdirSync("public/imports", { recursive: true });
cpSync("src/data/budrik.json", "public/imports/budrik.json");

// Serve PDF.js fonts and image decoders locally, including their licenses.
const require = createRequire(import.meta.url);
const source = dirname(require.resolve("pdfjs-dist/package.json"));
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const target = join("public", "pdfjs", folder);
  mkdirSync(target, { recursive: true });
  cpSync(join(source, folder), target, { recursive: true });
}
console.log(
  "Fontes e decodificadores do leitor PDF preparados para uso local.",
);
