import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
test("PDF mobile: pinça, arraste e gesto de página", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Abrir ferramentas", exact: true })
    .click();
  await page.getByRole("button", { name: /Livro de referência/ }).click();
  await expect(page.locator(".book-pdf canvas")).toBeVisible();
  const client = await context.newCDPSession(page);
  const touch = async (
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
    [140, 260],
    [240, 260],
  ]);
  await touch("touchMove", [
    [120, 260],
    [260, 260],
  ]);
  await touch("touchMove", [
    [100, 260],
    [280, 260],
  ]);
  await touch("touchEnd", []);
  await expect(page.locator(".reader-zoom-label")).toHaveText("180%");
  await expect(page.locator(".book-pdf-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );

  await page.locator(".book-pdf-scroll").evaluate((el) => (el.scrollLeft = 0));
  await touch("touchStart", [[270, 280]]);
  await touch("touchMove", [[240, 280]]);
  await touch("touchMove", [[180, 280]]);
  await touch("touchMove", [[130, 280]]);
  await touch("touchEnd", []);
  await expect
    .poll(() =>
      page.locator(".book-pdf-scroll").evaluate((el) => el.scrollLeft),
    )
    .toBeGreaterThan(0);
  await expect(page.getByLabel("Página do livro", { exact: true })).toHaveValue(
    "17",
  );
  await page
    .getByRole("button", { name: "Zoom e opções", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ajustar à largura", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Zoom e opções", exact: true })
    .click();
  await expect(page.locator(".book-pdf-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await touch("touchStart", [[270, 280]]);
  await touch("touchMove", [[240, 280]]);
  await touch("touchMove", [[180, 280]]);
  await touch("touchMove", [[130, 280]]);
  await touch("touchEnd", []);
  await expect(page.getByLabel("Página do livro", { exact: true })).toHaveValue(
    "18",
  );
});
