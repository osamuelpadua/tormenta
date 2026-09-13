import { test, expect } from "@playwright/test";

test("importa a ficha manuscrita pelas telas de backup e mantém os recursos ao reabrir", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Restaurar um backup" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("public/imports/budrik.json");
  await page.getByRole("button", { name: "Importar como cópias" }).click();
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
    path: ".cache/screenshots/budrik-importado.png",
    fullPage: true,
  });
});
