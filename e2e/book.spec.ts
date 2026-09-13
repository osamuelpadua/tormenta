import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("PDF original com zoom no celular, troca rápida de páginas e ilustrações offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Livro de referência", exact: true })
    .click();
  await page.getByLabel("Página do livro").fill("32");
  const canvas = page.locator(".book-pdf canvas");
  await expect(canvas).toHaveAttribute(
    "aria-label",
    "Página 32 do livro original · PDF 38",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  await page
    .getByRole("button", { name: "Aumentar zoom", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aumentar zoom", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ajustar à largura" }),
  ).toHaveText("150%");
  await expect(page.locator(".book-pdf-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    await page
      .locator(".book-reader .modal-body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const scroller = page.locator(".book-pdf-scroll");
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await scroller.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await mkdir(".cache/screenshots", { recursive: true });
  await page.screenshot({ path: ".cache/screenshots/livro-pdf-mobile.png" });
  await page.getByRole("button", { name: "Ajustar à largura" }).click();
  for (const value of ["33", "394", "17", "32"])
    await page.getByLabel("Página do livro").fill(value);
  await expect(canvas).toHaveAttribute(
    "aria-label",
    "Página 32 do livro original · PDF 38",
  );
  await expect(canvas).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page
    .getByRole("button", { name: "Livro de referência", exact: true })
    .click();
  // PDF p. 12 is an illustration: it must render even without extracted text.
  await page.getByLabel("Página do livro").fill("6");
  await expect(canvas).toHaveAttribute(
    "aria-label",
    "Página 6 do livro original · PDF 12",
  );
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const data = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      let colored = 0;
      for (let i = 0; i < data.length; i += 400)
        if (data[i] < 220 && data[i + 3] > 0) colored++;
      return colored > 100;
    }),
  ).toBe(true);
  await page.screenshot({
    path: ".cache/screenshots/livro-pdf-ilustracao-offline.png",
  });
  expect(errors).toEqual([]);
});

test("livro com parágrafos, tabela, busca, navegação e leitura offline no celular", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Livro de referência", exact: true })
    .click();
  await page.getByLabel("Página do livro").fill("32");
  await expect(
    page.getByRole("img", {
      name: "Página 32 do livro original · PDF 38",
      exact: true,
    }),
  ).toBeVisible();
  await mkdir(".cache/screenshots", { recursive: true });
  await page.screenshot({ path: ".cache/screenshots/livro-pdf-desktop.png" });
  await page.getByLabel("Visualização do livro").selectOption("reading");
  const article = page.locator(".book-page");
  await expect(
    article.getByRole("heading", { name: "Classes", exact: true }),
  ).toBeVisible();
  await expect(
    article.getByRole("heading", { name: "Características das Classes" }),
  ).toBeVisible();
  await expect(article.locator("p").first()).toContainText(
    "Uma classe é como uma profissão. Ela representa a forma",
  );
  const table = page.getByRole("table", { name: "Tabela 1-3: Classes" });
  await expect(table.getByRole("row")).toHaveCount(15);
  await expect(table.getByRole("row", { name: /^Caçador / })).toContainText(
    "Sobrevivência, mais 4",
  );
  await expect(article.locator(".book-table-notes")).toContainText(
    "Mais sua Constituição.",
  );
  await mkdir(".cache/screenshots", { recursive: true });
  await page.screenshot({ path: ".cache/screenshots/livro-desktop.png" });
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".cache/screenshots/livro-tabela-desktop.png",
  });
  await expect(
    page.getByPlaceholder("Buscar no livro (ao menos 3 caracteres)…"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(article).toContainText("Habilidades de Classe");
  await expect
    .poll(() =>
      page.locator(".book-reader .modal-body").evaluate((el) => el.scrollTop),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Anterior", exact: true }).click();
  await page.getByRole("button", { name: "Aumentar texto" }).click();
  await expect(article.locator("p").first()).toHaveCSS("font-size", "19px");
  await page.getByLabel("Visualização do livro").selectOption("raw");
  await expect(article.locator(".book-original")).toContainText("Capítulo Um");
  await expect(table).toHaveCount(0);
  await page.getByLabel("Visualização do livro").selectOption("reading");
  await expect(table.getByRole("row")).toHaveCount(15);
  const search = page.getByPlaceholder(
    "Buscar no livro (ao menos 3 caracteres)…",
  );
  await search.fill("inexistente123456789");
  await expect(page.getByRole("status")).toHaveText(
    "Nenhuma página encontrada.",
  );
  await search.fill("escolhendo sua classe");
  await page
    .locator(".book-results")
    .getByRole("button")
    .filter({ hasText: "p. 32" })
    .click();
  await expect(search).toHaveValue("");
  await expect(
    article.getByRole("heading", { name: "Classes", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Livro de referência", exact: true })
    .click();
  await page.getByLabel("Página do livro").fill("32");
  await expect(
    page.getByRole("img", {
      name: "Página 32 do livro original · PDF 38",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Visualização do livro").selectOption("reading");
  await expect(table.getByRole("row")).toHaveCount(15);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".cache/screenshots/livro-mobile.png" });
  await table.scrollIntoViewIfNeeded();
  const scroller = page.getByRole("region", { name: "Tabela 1-3: Classes" });
  await expect(scroller).toBeVisible();
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  expect(
    await page
      .locator(".book-reader .modal-body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await scroller.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await page.screenshot({ path: ".cache/screenshots/livro-tabela-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
