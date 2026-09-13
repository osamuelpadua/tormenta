import { test, expect } from "@playwright/test";

test("PDF: pesquisa preservada, destaques, todos os resultados e controles recolhíveis", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Livro de referência", exact: true })
    .click();
  const canvas = page.locator(".book-pdf canvas");
  await expect(canvas).toBeVisible();
  const input = page.getByLabel("Página do livro", { exact: true });
  await input.fill("3");
  await expect(canvas).toHaveAttribute("aria-label", /Página 17 /);
  await input.fill("32");
  await input.press("Enter");
  await expect(canvas).toHaveAttribute("aria-label", /Página 32 /);
  await input.fill("402");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("401");
  await expect(canvas).toHaveAttribute("aria-label", /Página 32 /);
  await input.fill("32");
  await input.press("Enter");
  await page.keyboard.press("Control+f");
  const search = page.getByRole("searchbox", { name: "Buscar no livro" });
  await expect(search).toBeFocused();
  await search.fill("inexistente123456789");
  await expect(page.locator(".reader-search-status")).toHaveText(
    "Nenhuma página encontrada.",
  );
  await search.fill("acao");
  await expect(page.locator(".reader-result")).toHaveCount(24);
  await page.getByRole("button", { name: /Ver mais resultados/ }).click();
  await expect(page.locator(".reader-result")).toHaveCount(48);
  await search.fill("escolhendo sua classe");
  await page.locator(".reader-result").filter({ hasText: "Página 32" }).click();
  await expect(search).toHaveCount(0);
  await expect(
    page.locator(".book-pdf-highlights > span").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pesquisar no livro", exact: true })
    .click();
  await expect(search).toHaveValue("escolhendo sua classe");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Recolher controles" }).click();
  await expect(page.locator(".reader-dock")).toBeHidden();
  await page.setViewportSize({ width: 320, height: 640 });
  await expect
    .poll(() =>
      page
        .locator(".book-reader .modal-body")
        .evaluate((el) => el.clientHeight),
    )
    .toBeGreaterThanOrEqual(638);
  await page.getByRole("button", { name: "Mostrar controles" }).click();
  await page.locator(".book-pdf-scroll").focus();
  await page.keyboard.press("PageDown");
  await expect(canvas).toHaveAttribute("aria-label", /Página 33 /);
  await expect(page.getByLabel("Visualização do livro")).toHaveCount(0);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Abrir ferramentas", exact: true })
    .click();
  await page.getByRole("button", { name: /Livro de referência/ }).click();
  await page
    .getByRole("button", { name: "Pesquisar no livro", exact: true })
    .click();
  await search.fill("escolhendo sua classe");
  await page.locator(".reader-result").filter({ hasText: "Página 32" }).click();
  await expect(
    page.locator(".book-pdf-highlights > span").first(),
  ).toBeVisible();
});
