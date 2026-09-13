import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Source checkout is only needed to regenerate the committed sprite.
const source = path.resolve(process.argv[2] ?? ".cache/game-icons");
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const files = new Map();
for (const dir of fs.readdirSync(source, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith(".")) continue;
  for (const name of fs.readdirSync(path.join(source, dir.name))) {
    if (name.endsWith(".svg"))
      files.set(name.slice(0, -4), {
        author: dir.name,
        file: path.join(source, dir.name, name),
      });
  }
}
// Prefer the two principal fantasy collections when filenames are shared.
for (const author of ["delapouite", "lorc"]) {
  for (const name of fs.readdirSync(path.join(source, author))) {
    if (name.endsWith(".svg"))
      files.set(name.slice(0, -4), {
        author,
        file: path.join(source, author, name),
      });
  }
}
const names = {};
for (const line of fs
  .readFileSync("scripts/entity-icon-map.txt", "utf8")
  .split(/\r?\n/)) {
  if (!line.trim() || line.startsWith("#")) continue;
  const [name, icon] = line.split("=").map((part) => part.trim());
  if (!files.has(icon)) throw new Error(`Missing artwork: ${name} = ${icon}`);
  names[normalize(name)] = icon;
}
const ordered = Object.keys(names).sort((a, b) => b.length - a.length);
const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));
const equipment = JSON.parse(
  fs.readFileSync("src/data/equipment.json", "utf8"),
);
for (const entry of [...catalog, ...equipment]) {
  const name = normalize(entry.name);
  const key = ordered.find((key) => ` ${name} `.includes(` ${key} `));
  if (!key) throw new Error(`Unmapped entity: ${entry.name}`);
  names[name] = names[key];
}
const symbols = [];
const credits = [];
for (const name of [...new Set(Object.values(names))].sort()) {
  const { author, file } = files.get(name);
  let svg = fs.readFileSync(file, "utf8");
  if (/<(?:script|foreignObject|image)\b|\son\w+=/i.test(svg))
    throw new Error(`Non-vector content: ${name}`);
  const body = svg.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/, "");
  // A luminance mask preserves all cutouts from the original white-on-black artwork.
  // Only its presentation changes: transparency and the surrounding UI's ink color.
  symbols.push(
    `<symbol id="${name}" viewBox="0 0 512 512"><mask id="mask-${name}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512" style="mask-type:luminance">${body}</mask><path fill="currentColor" mask="url(#mask-${name})" d="M0 0h512v512H0z"/></symbol>`,
  );
  credits.push({
    icon: name,
    author,
    source: `https://game-icons.net/1x1/${author}/${name}.html`,
    license: "https://creativecommons.org/licenses/by/3.0/",
  });
}
fs.mkdirSync("public/art", { recursive: true });
fs.writeFileSync(
  "public/art/entity-icons.svg",
  `<svg xmlns="http://www.w3.org/2000/svg"><!-- Game-icons.net, CC BY 3.0. Authors and sources: entity-icons-credits.json. Recolored; original geometry preserved. -->${symbols.join("\n")}</svg>\n`,
);
fs.writeFileSync(
  "src/ui/entity-art.json",
  JSON.stringify(
    Object.fromEntries(
      Object.entries(names).sort(([a], [b]) => a.localeCompare(b)),
    ),
    null,
    2,
  ) + "\n",
);
fs.writeFileSync(
  "public/art/entity-icons-credits.json",
  JSON.stringify(
    {
      source: "https://github.com/game-icons/icons",
      revision: execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      changes:
        "Combined as SVG symbols; transparent cutouts and inherited color via luminance masks. Original drawing geometry preserved.",
      icons: credits,
    },
    null,
    2,
  ) + "\n",
);
fs.copyFileSync(
  path.join(source, "license.txt"),
  "public/art/entity-icons-LICENSE.txt",
);
fs.writeFileSync(
  "public/art/credits.html",
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Créditos dos ícones · Tormenta Wiki</title><style>body{max-width:900px;margin:40px auto;padding:0 20px;background:#111311;color:#ebe5d8;font:16px/1.6 system-ui}a{color:#e0c58e}h1,h2{font-family:Georgia,serif}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:9px;border-bottom:1px solid #363b31}svg{width:38px;height:38px;color:#c6a76b}small{color:#b2af9f}</style><h1>Arte dos ícones</h1><p>Ilustrações de <a href="https://game-icons.net/">Game-icons.net</a>, sob a licença <a href="https://creativecommons.org/licenses/by/3.0/">Creative Commons Attribution 3.0</a>. Cada desenho é creditado abaixo. Foram combinados em um arquivo SVG, com fundo transparente e cores adaptadas à interface; a geometria original foi preservada.</p><p><a href="entity-icons-LICENSE.txt">Licença e lista original de autores</a> · <a href="entity-icons-credits.json">Fontes e versão utilizada</a></p><table><thead><tr><th>Ícone</th><th>Desenho original</th><th>Autor</th></tr></thead><tbody>${credits.map((c) => `<tr><td><svg aria-hidden="true"><use href="entity-icons.svg#${c.icon}"/></svg></td><td><a href="${c.source}">${c.icon}</a></td><td>${c.author}</td></tr>`).join("\n")}</tbody></table></html>`,
);
console.log(
  `${Object.keys(names).length} names, ${symbols.length} drawings. Full catalog and equipment coverage.`,
);
