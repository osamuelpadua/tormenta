import { test, expect, type Page } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { mkdir } from "node:fs/promises";

async function records(page: Page, store: string): Promise<any[]> {
  return page.evaluate(
    (storeName) =>
      new Promise<any[]>((resolve, reject) => {
        const opening = indexedDB.open("tormenta-personagens");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result,
            request = database
              .transaction(storeName)
              .objectStore(storeName)
              .getAll();
          request.onsuccess = () => {
            resolve(request.result);
            database.close();
          };
          request.onerror = () => {
            reject(request.error);
            database.close();
          };
        };
      }),
    store,
  );
}
async function openMap(page: Page) {
  await page.goto("/#maps");
  await page
    .getByRole("button", { name: "Abrir Aethelgard", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Mapa interativo" }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
}
async function addLocation(page: Page, name = "Cidade de Valdris") {
  await page
    .getByRole("button", { name: "Adicionar local", exact: true })
    .click();
  const canvas = page.locator(".atlas-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: box.width * 0.48, y: box.height * 0.48 },
  });
  await page.getByLabel("Nome do local", { exact: true }).fill(name);
  await page.getByLabel("Categoria", { exact: true }).selectOption("city");
  await page
    .getByRole("button", { name: "Ícone: Castelo", exact: true })
    .click();
  await page
    .getByLabel("Descrição e anotações")
    .fill("Capital do reino. NPC: Ayla. Missão: recuperar o selo.");
  await page.getByRole("button", { name: "Salvar local", exact: true }).click();
  await expect(page.locator(".atlas-location-details")).toContainText(name);
}

test("atlas: cria, edita, move e exclui locais sem perder posições ao navegar", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openMap(page);
  await addLocation(page);
  const [original] = await records(page, "mapLocations");
  expect(original).toMatchObject({
    name: "Cidade de Valdris",
    categoryId: "city",
    iconId: "castle",
  });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByLabel("Nome do local", { exact: true })
    .fill("Valdris — capital");
  await page
    .getByLabel("Descrição e anotações")
    .fill("Segredo do mestre\nNPC: Ayla\n<script>inofensivo</script>");
  await page.getByRole("button", { name: "Salvar local", exact: true }).click();
  await page
    .getByRole("button", { name: "Fechar informações do local" })
    .click();
  const canvas = page.locator(".atlas-canvas");
  const initialZoom = Number(await canvas.getAttribute("data-zoom"));
  await canvas.hover();
  await page.mouse.wheel(0, -400);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-zoom")))
    .toBeGreaterThan(initialZoom);
  const position = (await canvas.boundingBox())!;
  await page.mouse.move(
    position.x + position.width / 2,
    position.y + position.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    position.x + position.width / 2 + 70,
    position.y + position.height / 2 + 35,
    { steps: 8 },
  );
  await page.mouse.up();
  expect((await records(page, "mapLocations"))[0]).toMatchObject({
    x: original.x,
    y: original.y,
  });
  await page.getByRole("button", { name: "Ajustar mapa à tela" }).click();
  await page
    .getByRole("button", { name: "Valdris — capital", exact: true })
    .click();
  await page.getByRole("button", { name: "Mover", exact: true }).click();
  await expect(page.locator(".atlas-pin.moving")).toBeVisible();
  await canvas.click({
    position: { x: position.width * 0.3, y: position.height * 0.3 },
  });
  await page
    .getByRole("button", { name: "Confirmar posição", exact: true })
    .click();
  const [moved] = await records(page, "mapLocations");
  expect(moved.x).not.toBe(original.x);
  expect(moved.notes).toContain("Segredo do mestre");
  await page.reload();
  await page
    .getByRole("button", { name: "Valdris — capital", exact: true })
    .click();
  await expect(page.locator(".atlas-location-details")).toContainText(
    "<script>inofensivo</script>",
  );
  await mkdir(".cache/screenshots/maps", { recursive: true });
  expect(
    (await page.locator(".atlas-map-area").boundingBox())!.width,
  ).toBeGreaterThan(1000);
  await page.screenshot({
    path: ".cache/screenshots/maps/desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page
    .getByRole("button", { name: "Excluir local", exact: true })
    .click();
  await expect
    .poll(() => records(page, "mapLocations").then((items) => items.length))
    .toBe(0);
  expect(errors).toEqual([]);
});

test("atlas mobile: menu, pinça, pan, marcação touch e formulários acessíveis", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Abrir ferramentas", exact: true })
      .tap();
    await page.getByRole("button", { name: /Mapas Explore territórios/ }).tap();
    await page
      .getByRole("button", { name: "Abrir Aethelgard", exact: true })
      .tap();
    const canvas = page.locator(".atlas-canvas");
    await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
    const zoom = Number(await canvas.getAttribute("data-zoom"));
    const box = (await canvas.boundingBox())!,
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const client = await context.newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      points: number[][],
    ) =>
      client.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([x, y], id) => ({
          x,
          y,
          id,
          radiusX: 5,
          radiusY: 5,
        })),
      });
    await touch("touchStart", [
      [x - 40, y],
      [x + 40, y],
    ]);
    for (const distance of [55, 75, 100])
      await touch("touchMove", [
        [x - distance, y],
        [x + distance, y],
      ]);
    await touch("touchEnd", []);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-zoom")))
      .toBeGreaterThan(zoom + 0.5);
    const oldCenter = await canvas.getAttribute("data-center");
    await touch("touchStart", [[x + 70, y]]);
    for (const delta of [30, 0, -45])
      await touch("touchMove", [[x + delta, y + 15]]);
    await touch("touchEnd", []);
    await expect
      .poll(() => canvas.getAttribute("data-center"))
      .not.toBe(oldCenter);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await records(page, "mapLocations")).toHaveLength(0);
    await page
      .getByRole("button", { name: "Adicionar local", exact: true })
      .tap();
    await page.getByRole("button", { name: "Usar centro", exact: true }).tap();
    await page.getByLabel("Nome do local").fill("Santuário da Aurora");
    await page.getByLabel("Categoria", { exact: true }).selectOption("shrine");
    await page
      .getByLabel("Descrição e anotações")
      .fill("Curandeira e missão da lua.");
    const save = page.getByRole("button", {
      name: "Salvar local",
      exact: true,
    });
    const target = (await save.boundingBox())!;
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.y + target.height).toBeLessThanOrEqual(844);
    await save.tap();
    await expect(page.getByRole("dialog")).toContainText(
      "Curandeira e missão da lua.",
    );
    await page.getByRole("button", { name: "Mover", exact: true }).tap();
    const pin = page.locator(".atlas-pin.moving"),
      pinBox = (await pin.boundingBox())!;
    await touch("touchStart", [[pinBox.x + 22, pinBox.y + 22]]);
    await touch("touchMove", [[pinBox.x + 40, pinBox.y + 35]]);
    await touch("touchMove", [[pinBox.x + 65, pinBox.y + 45]]);
    await touch("touchEnd", []);
    await page.getByRole("button", { name: "Cancelar", exact: true }).tap();
    const [record] = await records(page, "mapLocations");
    expect(record.revision).toBe(0);
    await page.getByRole("button", { name: "Ajustar mapa à tela" }).tap();
    await expect
      .poll(async () =>
        page
          .locator(".leaflet-tile-loaded img")
          .evaluateAll((images) =>
            images.some(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-zoom")))
      .toBeCloseTo(zoom, 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await mkdir(".cache/screenshots/maps", { recursive: true });
    await page.screenshot({
      path: ".cache/screenshots/maps/mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(canvas).toBeVisible();
    expect((await records(page, "mapLocations"))[0]).toMatchObject({
      x: record.x,
      y: record.y,
    });
  } finally {
    await context.close();
  }
});

test("atlas: imagem personalizada, backup ZIP, restauração e exclusão persistente", async ({
  page,
}) => {
  await page.goto("/#maps");
  await page.getByRole("button", { name: "Novo mapa", exact: true }).click();
  await page
    .getByLabel("Nome do mapa", { exact: true })
    .fill("Masmorra de Elden");
  const image = createCanvas(800, 600),
    ctx = image.getContext("2d");
  ctx.fillStyle = "#dbbf80";
  ctx.fillRect(0, 0, 800, 600);
  ctx.strokeStyle = "#55452b";
  ctx.lineWidth = 5;
  ctx.strokeRect(100, 100, 600, 400);
  await page.getByLabel("Imagem do mapa", { exact: true }).setInputFiles({
    name: "dungeon.png",
    mimeType: "image/png",
    buffer: image.toBuffer("image/png"),
  });
  await page
    .getByLabel("Anotações do mapa", { exact: true })
    .fill("A chave está sob a ponte.");
  await expect(
    page.getByRole("button", { name: "Salvar mapa", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Salvar mapa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Masmorra de Elden", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await addLocation(page, "Entrada da cripta");
  // An open map covers the app, like the book reader; leave it first.
  await page.getByRole("button", { name: "Voltar aos mapas" }).click();
  await page
    .getByRole("button", { name: "Backups e importação", exact: true })
    .click();
  const custom = (await records(page, "atlasMaps")).find(
    (map) => map.name === "Masmorra de Elden",
  );
  await page.getByLabel("Mapas para exportar").selectOption(custom.id);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar mapas/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByRole("button", { name: /Importar mapas Restaurar/ }).click();
  await page.getByLabel("Arquivo de backup dos mapas").setInputFiles(path!);
  await expect(
    page.getByRole("heading", { name: "Prévia dos mapas" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Importar mapas como cópias", exact: true })
    .click();
  await expect(
    page.locator(".atlas-backup-section").getByRole("status"),
  ).toContainText("restaurado");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", {
      name: "Abrir Masmorra de Elden (cópia)",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Excluir Masmorra de Elden", exact: true })
    .click();
  await page.getByRole("button", { name: "Excluir mapa", exact: true }).click();
  await page
    .getByRole("button", { name: "Excluir Aethelgard", exact: true })
    .click();
  await page.getByRole("button", { name: "Excluir mapa", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Abrir Aethelgard", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Abrir Masmorra de Elden (cópia)",
      exact: true,
    })
    .click();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Entrada da cripta", exact: true })
    .click();
  await expect(page.locator(".atlas-location-details")).toContainText(
    "NPC: Ayla",
  );
  const [beforeReplace] = await records(page, "mapLocations");
  await page.getByRole("button", { name: "Editar mapa", exact: true }).click();
  const replacement = createCanvas(600, 800),
    replacementContext = replacement.getContext("2d");
  replacementContext.fillStyle = "#ceb77a";
  replacementContext.fillRect(0, 0, 600, 800);
  await page.getByLabel("Imagem do mapa", { exact: true }).setInputFiles({
    name: "vertical.png",
    mimeType: "image/png",
    buffer: replacement.toBuffer("image/png"),
  });
  await expect(
    page.getByText("Substituir a imagem mantendo os locais", { exact: false }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Salvar mapa", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await records(page, "mapLocations"))[0]).toMatchObject({
    x: beforeReplace.x,
    y: beforeReplace.y,
    notes: beforeReplace.notes,
  });
  await page.reload();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
});

test("atlas: disponível sem personagens e offline com todos os níveis de Aethelgard", async ({
  page,
  context,
}) => {
  await openMap(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("tormenta-personagens");
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction("characters", "readwrite");
          tx.objectStore("characters").clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Mapa interativo" }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  for (let i = 0; i < 7; i++)
    await page.getByRole("button", { name: "Aumentar zoom" }).click();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await expect(page.locator(".atlas-load-error")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Adicionar local", exact: true })
    .click();
  await page.getByRole("button", { name: "Usar centro" }).click();
  await page.getByLabel("Nome do local").fill("Descoberta offline");
  await page.getByRole("button", { name: "Salvar local", exact: true }).click();
  await expect(page.locator(".atlas-location-details")).toContainText(
    "Descoberta offline",
  );
  await page.reload();
  expect((await records(page, "mapLocations"))[0].name).toBe(
    "Descoberta offline",
  );
  expect(await records(page, "atlasMaps")).toHaveLength(1);
  await page
    .getByRole("button", { name: "Backups e importação", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar mapas/ }).click();
  const backup = await downloadPromise;
  const backupPath = (await backup.path())!;
  await page.getByRole("button", { name: /Importar mapas Restaurar/ }).click();
  await page
    .getByLabel("Arquivo de backup dos mapas")
    .setInputFiles(backupPath);
  await expect(
    page.getByRole("heading", { name: "Prévia dos mapas" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Importar mapas como cópias", exact: true })
    .click();
  await expect(
    page.locator(".atlas-backup-section").getByRole("status"),
  ).toContainText("restaurado");
  expect(await records(page, "atlasMaps")).toHaveLength(2);
  const copies = await records(page, "mapAssets");
  expect(copies.filter((asset) => asset.kind === "local")).toHaveLength(1);
});

test("atlas: mil locais, tiles limitados à viewport e redimensionamento", async ({
  page,
}) => {
  await openMap(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("tormenta-personagens");
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction("mapLocations", "readwrite"),
            store = tx.objectStore("mapLocations"),
            date = new Date().toISOString();
          for (let i = 0; i < 1000; i++)
            store.put({
              id: `load-${i}`,
              mapId: "builtin-aethelgard",
              name: `Local ${i}`,
              categoryId: "generic",
              iconId: "position-marker",
              x: ((i % 40) + 0.5) / 40,
              y: (Math.floor(i / 40) + 0.5) / 25,
              notes: "",
              revision: 0,
              createdAt: date,
              updatedAt: date,
            });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  const canvas = page.locator(".atlas-canvas");
  await expect(page.locator(".atlas-pin")).toHaveCount(1000);
  await canvas.evaluate((el) => el.setAttribute("data-preserved", "yes"));
  for (let i = 0; i < 6; i++)
    await page.getByRole("button", { name: "Aumentar zoom" }).click();
  await expect.poll(() => page.locator(".atlas-pin").count()).toBeLessThan(300);
  expect(await page.locator(".leaflet-tile").count()).toBeLessThan(60);
  await expect(canvas).toHaveAttribute("data-preserved", "yes");
  for (const width of [320, 600, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(canvas).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
});
