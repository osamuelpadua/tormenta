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
  await page.getByLabel("Página do livro").press("Enter");
  const canvas = page.locator(".book-pdf canvas");
  await expect(canvas).toHaveAttribute(
    "aria-label",
    "Página 32 do livro original · PDF 38",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  await page
    .getByRole("button", { name: "Zoom e opções", exact: true })
    .click();
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
  for (const value of ["33", "394", "17", "32"]) {
    await page.getByLabel("Página do livro").fill(value);
    await page.getByLabel("Página do livro").press("Enter");
  }
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
  await expect(page.locator(".book-pdf canvas")).toBeVisible();
  // PDF p. 12 is an illustration: it must render even without extracted text.
  await page.getByLabel("Página do livro").fill("6");
  await page.getByLabel("Página do livro").press("Enter");
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
