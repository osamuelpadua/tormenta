import { test, expect } from "@playwright/test";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("o PDF permanece estável com barras de rolagem que ocupam largura", async ({
  page,
}) => {
  await page.goto("/");
  // Classic Windows scrollbars reserve space. Playwright normally hides them,
  // which concealed the resize/render feedback loop in the original tests.
  await page.addStyleTag({
    content: `
    .book-reader .modal-body { scrollbar-width: auto; }
    .book-reader .modal-body::-webkit-scrollbar { width: 17px; }
  `,
  });
  await page
    .getByRole("button", { name: "Livro de referência", exact: true })
    .click();
  const canvas = page.locator(".book-pdf canvas");
  await expect(canvas).toBeVisible();
  const changes = await page
    .locator(".book-reader")
    .evaluate(async (dialog) => {
      const frame = dialog.querySelector(".book-pdf")!;
      const host = dialog.querySelector(".book-pdf-host")!;
      const scroller = dialog.querySelector(".modal-body")!;
      const initialCanvas = host.querySelector("canvas");
      let replacements = 0;
      let hiddenFrames = 0;
      let gutter = 0;
      const widths = new Set<number>();
      const heights = new Set<number>();
      const observer = new MutationObserver((records) => {
        replacements += records.filter(
          (r) => r.type === "childList" && r.target === host,
        ).length;
      });
      observer.observe(host, { childList: true });
      const until = performance.now() + 2200;
      while (performance.now() < until) {
        await new Promise(requestAnimationFrame);
        widths.add(Math.round(frame.getBoundingClientRect().width));
        heights.add(Math.round(dialog.getBoundingClientRect().height));
        gutter = Math.max(
          gutter,
          scroller.getBoundingClientRect().width - scroller.clientWidth,
        );
        if (!host.checkVisibility({ checkVisibilityCSS: true })) hiddenFrames++;
      }
      observer.disconnect();
      return {
        replacements,
        hiddenFrames,
        widths: [...widths],
        heights: [...heights],
        sameCanvas: host.querySelector("canvas") === initialCanvas,
        gutter,
      };
    });
  expect(changes.gutter, JSON.stringify(changes)).toBeGreaterThan(0);
  expect(changes.replacements, JSON.stringify(changes)).toBe(0);
  expect(changes.hiddenFrames, JSON.stringify(changes)).toBe(0);
  expect(changes.sameCanvas).toBe(true);
  expect(changes.widths).toHaveLength(1);
  expect(changes.heights).toHaveLength(1);
});
