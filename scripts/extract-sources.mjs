import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const require = createRequire(import.meta.url);
const { createCanvas } = createRequire(require.resolve('pdfjs-dist/package.json'))('@napi-rs/canvas');

const directory = process.cwd();
for (const folder of ['.cache/pdf', 'src/data', 'docs']) fs.mkdirSync(folder, { recursive: true });
const sources = [];
for (const [id, name] of [['book', 'Tormenta20-Edicao-Jogo-do-Ano-17-11-2023_.pdf'], ['sheet', 'Tormenta20-Jogo-do-Ano-Ficha.pdf']]) {
  const bytes = fs.readFileSync(path.join(directory, name));
  const base = `${directory.replaceAll('\\', '/')}/node_modules/pdfjs-dist/`;
  const doc = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items = content.items.filter(i => 'str' in i && i.str.trim()).map(i => ({ text: i.str, x: i.transform[4], y: i.transform[5], height: i.height, font: i.fontName, end: i.hasEOL }));
    const text = content.items.filter(i => 'str' in i).map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('').replace(/(\p{L})\s*-\s*\n\s*(\p{Ll})/gu, '$1$2').replace(/[ \t]+/g, ' ').trim();
    pages.push({ page: n, printed: id === 'book' ? n - 6 : 1, text, items });
    if (id === 'sheet' || (id === 'book' && [4,5,6,12,24,38,65,121,149,150,151,159,174,218,243,246,286,330,400,401,407].includes(n))) {
      const viewport = page.getViewport({ scale: 1.35 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      fs.writeFileSync(`.cache/pdf/${id}-${n}.png`, canvas.toBuffer('image/png'));
    }
  }
  fs.writeFileSync(`.cache/pdf/${id}.json`, JSON.stringify(pages));
  fs.writeFileSync(`src/data/${id}-pages.json`, JSON.stringify(pages.map(({ items, ...page }) => page)));
  sources.push({ id, file: name, pages: doc.numPages, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), characters: pages.reduce((s,p) => s + p.text.length, 0), lowTextPages: pages.filter(p => p.text.length < 50).map(p => p.page) });
  console.log(`${id}: ${doc.numPages} páginas extraídas`);
}
fs.writeFileSync('docs/sources.json', JSON.stringify({ ruleset: 't20-jda-2023-11-17', sources }, null, 2));
