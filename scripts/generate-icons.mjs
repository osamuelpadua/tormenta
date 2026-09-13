import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs/promises";
const icon = await loadImage(await fs.readFile("public/icon.svg"));
for (const size of [192, 512]) {
  const canvas = createCanvas(size, size),
    context = canvas.getContext("2d");
  context.fillStyle = "#923d46";
  context.fillRect(0, 0, size, size);
  context.drawImage(icon, size * 0.12, size * 0.12, size * 0.76, size * 0.76);
  await fs.writeFile(`public/icon-${size}.png`, await canvas.encode("png"));
}
