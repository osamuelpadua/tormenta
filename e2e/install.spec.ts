import { test, expect, type Page } from "@playwright/test";

const recommendation = (page: Page) =>
  page.getByRole("region", { name: "Leve Tormenta Wiki com você" });

async function offer(page: Page, outcome: "accepted" | "dismissed" | "error") {
  await page.evaluate((result) => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        document.documentElement.dataset.promptCalls = String(
          Number(document.documentElement.dataset.promptCalls || 0) + 1,
        );
        if (result === "error") throw new Error("Unavailable browser prompt");
      },
      userChoice: Promise.resolve({ outcome: result }),
    });
    window.dispatchEvent(event);
  }, outcome);
}

test("primeira visita recomenda; dispensar persiste e mantém instalação no menu", async ({
  page,
}) => {
  await page.goto("/");
  await expect(recommendation(page)).toBeVisible();
  await recommendation(page).getByRole("button", { name: "Agora não" }).click();
  await page.reload();
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
  await expect(recommendation(page)).toHaveCount(0);
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Instalar app" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Instalar Tormenta Wiki" }),
  ).toBeVisible();
});

test("evento nativo simulado só abre por clique e confirmação de instalação encerra oferta", async ({
  page,
}) => {
  await page.goto("/");
  await expect(recommendation(page)).toBeVisible();
  await offer(page, "accepted");
  await expect(page.locator("html")).not.toHaveAttribute("data-prompt-calls");
  await recommendation(page)
    .getByRole("button", { name: "Instalar app" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-prompt-calls", "1");
  await expect(recommendation(page)).toHaveCount(0);
  await expect(
    page.getByText("Tormenta Wiki instalado.", { exact: false }),
  ).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByRole("status")).toContainText(
    "Tormenta Wiki instalado",
  );
  await expect(
    page
      .locator(".sidebar-bottom")
      .getByRole("button", { name: "Instalar app" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".character-banner h2")).toBeVisible();
  await expect(recommendation(page)).toHaveCount(0);
});

test("cancelar instalação permite tentar novamente com uma nova oferta do navegador", async ({
  page,
}) => {
  await page.goto("/");
  await expect(recommendation(page)).toBeVisible();
  await offer(page, "dismissed");
  await recommendation(page)
    .getByRole("button", { name: "Instalar app" })
    .click();
  await expect(recommendation(page)).toHaveCount(0);
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Instalar app" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Instalar agora" }),
  ).toHaveCount(0);
  await offer(page, "accepted");
  await page.getByRole("button", { name: "Instalar agora" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-prompt-calls", "2");
  await expect(page.getByRole("dialog")).toContainText("Instalação solicitada");
});

test("falha do prompt oferece instruções e não anuncia instalação", async ({
  page,
}) => {
  await page.goto("/");
  await expect(recommendation(page)).toBeVisible();
  await offer(page, "error");
  await recommendation(page)
    .getByRole("button", { name: "Instalar app" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível abrir a instalação",
  );
  await expect(page.getByRole("dialog")).toContainText("No computador");
});

for (const device of ["iPhone", "iPad", "Android"]) {
  test(`${device} recebe instruções e ações cabem em 320px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript((name) => {
      Object.defineProperty(navigator, "userAgent", {
        value: name === "iPad" ? "Macintosh" : name,
      });
      Object.defineProperty(navigator, "platform", {
        value: name === "iPad" ? "MacIntel" : name,
      });
      Object.defineProperty(navigator, "maxTouchPoints", { value: 5 });
      // Prevent Chromium's real offer from replacing this platform fallback.
      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      });
    }, device);
    await page.goto("/");
    await expect(recommendation(page)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await recommendation(page)
      .getByRole("button", { name: "Instalar app" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      device === "Android"
        ? "Instalar aplicativo"
        : "Adicionar à Tela de Início",
    );
    expect(
      await dialog
        .locator(".modal-body")
        .evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    await dialog.getByRole("button", { name: "Entendi" }).click();
    await page.getByRole("button", { name: "Abrir ferramentas" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Instalar app" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Instalar Tormenta Wiki" }),
    ).toBeVisible();
  });
}

for (const mode of ["ios", "standalone"]) {
  test(`app instalado não recomenda instalação (${mode})`, async ({ page }) => {
    await page.addInitScript((displayMode) => {
      if (displayMode === "ios")
        Object.defineProperty(navigator, "standalone", { value: true });
      else {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          const result = original(query);
          if (query === "(display-mode: standalone)")
            Object.defineProperty(result, "matches", { value: true });
          return result;
        };
      }
    }, mode);
    await page.goto("/");
    await expect(page.locator(".character-banner h2")).toBeVisible();
    await expect(recommendation(page)).toHaveCount(0);
    await expect(
      page
        .locator(".sidebar-bottom")
        .getByRole("button", { name: "Instalar app" }),
    ).toHaveCount(0);
  });
}
