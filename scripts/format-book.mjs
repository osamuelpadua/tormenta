import fs from "node:fs";

// The PDF content stream preserves reading order across columns. Its baselines,
// font sizes and paragraph spacing let us remove print-only line wrapping.
const pages = JSON.parse(fs.readFileSync(".cache/pdf/book.json", "utf8"));
const clean = (text) =>
  text
    .replace(/\s+([,.;:!?\)\]])/g, "$1")
    .replace(/([\(\[])\s+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
const reflow = (text) =>
  clean(
    text.replace(/(\p{L})\s*-\s*\n\s*(\p{Ll})/gu, "$1$2").replace(/\n/g, " "),
  );

function format(items) {
  const lines = [];
  for (const item of items.filter((i) => i.y > 43 && i.text.trim())) {
    const last = lines.at(-1);
    if (last && Math.abs(last.y - item.y) < 0.8 && item.x >= last.lastX) {
      last.items.push(item);
      last.lastX = item.x;
    } else {
      lines.push({
        x: item.x,
        lastX: item.x,
        y: item.y,
        height: item.height,
        items: [item],
      });
    }
  }
  const blocks = [];
  let previous;
  for (const line of lines) {
    const text = clean(line.items.map((i) => i.text).join(" "));
    const heading = line.height >= 15 && line.items[0].font.endsWith("_f1");
    const table = line.items.every((i) => i.font.endsWith("_f17"));
    const type = heading ? "heading" : table ? "lines" : "paragraph";
    const last = blocks.at(-1);
    const gap = previous ? previous.y - line.y : Infinity;
    const sameHeading =
      heading &&
      last?.type === "heading" &&
      Math.abs(previous.height - line.height) < 1 &&
      Math.abs(previous.x - line.x) < 3 &&
      gap > 0 &&
      gap < line.height * 1.4;
    const continuation =
      !heading && last?.type === type && gap > 0 && gap < line.height * 1.55;
    if (sameHeading || continuation) {
      last.text += "\n" + text;
    } else {
      const block = { type, text };
      if (heading)
        block.level = line.height >= 25 ? 1 : line.height >= 20 ? 2 : 3;
      if (type === "paragraph") {
        const lead = [];
        for (const item of line.items) {
          if (!item.font.endsWith("_f6")) break;
          lead.push(item.text);
        }
        if (lead.length) block.lead = clean(lead.join(" "));
      }
      blocks.push(block);
    }
    previous = line;
  }
  // Some page titles are painted after the body (e.g. the conditions appendix).
  const pageTitle = items.find(
    (i) => i.height === 26 && i.y > 660 && i.font.endsWith("_f1"),
  );
  const title = pageTitle
    ? blocks.findIndex((b) => b.type === "heading" && b.text === pageTitle.text)
    : -1;
  if (title > 0) blocks.unshift(...blocks.splice(title, 1));
  for (const block of blocks) {
    block.text = block.type === "lines" ? block.text : reflow(block.text);
    if (block.lead && !block.text.startsWith(block.lead)) delete block.lead;
  }
  return blocks;
}

function classTable(page) {
  // Table 1-3, printed p. 32 / PDF p. 38. Coordinates are from this edition.
  // Values come from the source table, independently of the rules engine.
  const caption = page.items.find((i) => i.text === "Tabela 1-3: Classes");
  if (!caption) throw new Error("Tabela de classes não encontrada na fonte.");
  const cells = page.items.filter((i) => i.height === 9 && i.y < caption.y);
  const labels = cells.filter((i) => i.x < 100);
  const boundaries = [100, 287, 353, 386, 412, Infinity];
  const rows = labels.map((label) =>
    boundaries.map((right, col) => {
      const left = col ? boundaries[col - 1] : 0;
      return reflow(
        cells
          .filter(
            (i) => i.x >= left && i.x < right && Math.abs(i.y - label.y) < 11,
          )
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .map((i) => i.text)
          .join("\n"),
      );
    }),
  );
  if (
    rows.length !== 14 ||
    rows.some(
      (row) =>
        row.some((cell) => !cell) ||
        !/^\d+$/.test(row[3]) ||
        !/^\d+$/.test(row[4]),
    )
  ) {
    throw new Error(
      "A disposição da tabela de classes mudou. Confira o PDF antes de gerar o leitor.",
    );
  }
  return [
    ...format(page.items.slice(0, page.items.indexOf(caption))),
    {
      type: "table",
      caption: caption.text,
      headers: ["Classe", "Descrição", "Atributo", "PV¹", "PM", "Perícias²"],
      rows,
      notes: page.items
        .filter((i) => i.height === 8 && i.y < 85 && i.y > 70)
        .map((i, index) => `${index + 1}. ${i.text.trim()}`),
    },
  ];
}

const layout = pages.map((page) => ({
  page: page.page,
  printed: page.printed,
  blocks: page.printed === 32 ? classTable(page) : format(page.items),
}));
fs.writeFileSync("src/data/book-layout.json", JSON.stringify(layout));
console.log(
  `${layout.length} páginas formatadas; tabela de classes com 14 linhas e 6 colunas.`,
);
