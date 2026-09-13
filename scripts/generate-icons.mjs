import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs/promises";
const icon = await loadImage(await fs.readFile("public/icon.svg"));
for (const size of [32, 180, 192, 512]) {
  const canvas = createCanvas(size, size),
    context = canvas.getContext("2d");
  context.fillStyle = "#111311";
  context.fillRect(0, 0, size, size);
  context.drawImage(icon, 0, 0, size, size);
  await fs.writeFile(`public/icon-${size}.png`, await canvas.encode("png"));
}
