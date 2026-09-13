import { test, expect, type Page } from "@playwright/test";

async function loadBudrik(page: Page) {
  await page.addInitScript(() => {
    crypto.getRandomValues = () => {
      throw new Error("O app tentou sortear dados");
    };
  });
  await page.goto("/");
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("tormenta-personagens");
      request.onsuccess = () => resolve(request.result);
    });
    const read = (store: string) =>
      new Promise<unknown[]>((resolve) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
      });
    const result = {
      characters: await read("characters"),
      history: await read("history"),
    };
    db.close();
    return result;
  });
}

test("consulta a perícia sem registrar; calcula e salva o d20 físico, inclusive no celular", async ({
  page,
}) => {
  await loadBudrik(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await snapshot(page);
  await page.getByPlaceholder("Pesquisar perícia…").fill("Acrobacia");
  await page.locator(".skill-row").click();
  const modal = page.getByRole("dialog", { name: "Acrobacia", exact: true });
  await expect(
    modal.getByRole("button", { name: "Registrar teste" }),
  ).toBeDisabled();
  await expect(modal).toContainText("Role 1d20 na mesa e some +2");
  await modal
    .getByRole("button", { name: "Fechar", exact: true })
    .last()
    .click();
  expect(await snapshot(page)).toEqual(before);
  await page.locator(".skill-row").click();
  await modal.getByLabel("Resultado do d20 (opcional)").fill("21");
  await expect(
    modal.getByRole("button", { name: "Registrar teste" }),
  ).toBeDisabled();
  await modal.getByLabel("Resultado do d20 (opcional)").fill("12");
  await modal.getByLabel("Modificador contextual").fill("3");
  await modal.getByLabel("Classe de dificuldade").fill("17");
  await expect(modal.getByRole("status")).toContainText("12 + 5 = 17");
  await expect(modal.getByRole("status")).toContainText("sucesso");
  await page.screenshot({
    path: ".cache/screenshots/pericia-dados-fisicos-mobile.png",
  });
  await modal.getByRole("button", { name: "Registrar teste" }).click();
  await expect(modal).toHaveCount(0);
  const recorded = await snapshot(page);
  expect(recorded.history).toHaveLength(before.history.length + 1);
  expect(recorded.history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: "Acrobacia",
        rolls: [expect.objectContaining({ total: 17, natural: 12 })],
      }),
    ]),
  );
  await page.reload();
  expect(await snapshot(page)).toEqual(recorded);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("cancelar os dados de um ataque preserva a ficha; confirmar salva os dados da mesa", async ({
  page,
}) => {
  await loadBudrik(page);
  const before = await snapshot(page);
  await page
    .getByRole("button", { name: /Atacar com Machado de guerra/ })
    .click();
  await page.getByLabel("Defesa do alvo (opcional)").fill("10");
  await page
    .getByRole("button", { name: "Registrar ataque", exact: true })
    .click();
  let dice = page.locator(".physical-dice-modal");
  await expect(
    dice.getByRole("button", { name: "Confirmar dados" }),
  ).toBeDisabled();
  await dice.getByLabel("Dado 1 (d20)").fill("12");
  await dice.getByRole("button", { name: "Confirmar dados" }).click();
  await expect(dice).toContainText("Dano: Machado de guerra");
  await dice.getByRole("button", { name: "Cancelar registro" }).click();
  expect(await snapshot(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Registrar ataque", exact: true })
    .click();
  await dice.getByLabel("Dado 1 (d20)").fill("12");
  await dice.getByRole("button", { name: "Confirmar dados" }).click();
  await dice.getByLabel("Dado 1 (d12)").fill("7");
  await dice.getByRole("button", { name: "Confirmar dados" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await snapshot(page);
  expect(after.history).toHaveLength(before.history.length + 1);
  expect(after.history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: "Ataque: Machado de guerra",
        rolls: [
          expect.objectContaining({ natural: 12 }),
          expect.objectContaining({
            dice: [expect.objectContaining({ values: [7] })],
          }),
        ],
      }),
    ]),
  );
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
