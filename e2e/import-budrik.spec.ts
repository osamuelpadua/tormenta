import { test, expect } from "@playwright/test";

test("abre com Budrik como exemplo e mantém uma única ficha com os recursos ao reabrir", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
  await expect(
    page.locator(".resource-card.hp .resource-value>strong"),
  ).toHaveText("69");
  await expect(
    page.locator(".resource-card.mp .resource-value>strong"),
  ).toHaveText("12");
  await expect(page.locator(".resource-card.hp")).toContainText("98");
  await expect(page.locator(".resource-card.mp")).toContainText("18");
  await page.reload();
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
  const stored = await page.evaluate(async () => {
    const request = indexedDB.open("tormenta-personagens");
    const database = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const rows = database
      .transaction("characters")
      .objectStore("characters")
      .getAll();
    const characters = await new Promise<
      Array<{ name: string; notes: string }>
    >((resolve) => {
      rows.onsuccess = () => resolve(rows.result);
    });
    database.close();
    return characters;
  });
  expect(stored).toHaveLength(1);
  expect(stored[0].notes).toContain("Heróis de Arton");
  expect(stored[0].notes).toContain("Marreta (certeira), ataque 11");
  await page.screenshot({
    path: ".cache/screenshots/budrik-padrao.png",
    fullPage: true,
  });
});

test("permite importar o backup de Budrik além do personagem de exemplo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
  const originalId = await page.locator("#character-select").inputValue();
  await page
    .getByRole("button", { name: "Backups e importação", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles("public/imports/budrik.json");
  await page.getByRole("button", { name: "Importar como cópias" }).click();
  await expect(page.locator("#character-select option")).toHaveCount(2);
  await expect(page.locator("#character-select")).not.toHaveValue(originalId);
  const importedId = await page.locator("#character-select").inputValue();
  await page.reload();
  await expect(page.locator("#character-select")).toHaveValue(importedId);
  await expect(page.locator("#character-select option")).toHaveCount(2);
});

test("arquivar o exemplo mantém a lista vazia depois de reabrir", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
  await page.getByLabel("Opções do personagem").click();
  await page
    .getByRole("button", { name: "Arquivar personagem", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Arquivar personagem", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Criar meu personagem", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Criar meu personagem", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".character-banner")).toHaveCount(0);
});
