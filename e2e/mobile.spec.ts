import { test, expect, type Page, type Locator } from "@playwright/test";
import { hero } from "../tests/fixtures";
import { RULESET, entryNamed } from "../src/data/rules";
import { acquisition } from "../src/domain/character";

test.use({ hasTouch: true });

async function loadBudrik(page: Page) {
  await page.goto("/");
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
}

async function touchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function dialogFits(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const size = await dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const body = el.querySelector(".modal-body")!;
    const footer = el.querySelector(".modal-footer")?.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      bottom: box.bottom,
      width: innerWidth,
      height: innerHeight,
      overflow: body.scrollWidth - body.clientWidth,
      footerBottom: footer?.bottom ?? box.bottom,
    };
  });
  expect(size.left).toBeGreaterThanOrEqual(0);
  expect(size.right).toBeLessThanOrEqual(size.width + 1);
  expect(size.bottom).toBeLessThanOrEqual(size.height + 1);
  expect(size.footerBottom).toBeLessThanOrEqual(size.height + 1);
  expect(size.overflow).toBeLessThanOrEqual(1);
  await touchTarget(
    dialog
      .locator(".modal-heading")
      .getByRole("button", { name: "Fechar", exact: true }),
  );
}

for (const width of [320, 390, 600, 768, 900, 1024, 1440]) {
  test(`as cinco áreas cabem em ${width}px e mantêm navegação e ações acessíveis`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await loadBudrik(page);
    const nav = page.locator(width <= 900 ? ".mobile-nav" : ".main-nav");
    await expect(nav).toBeVisible();
    for (const name of [
      "Ficha",
      "Combate",
      "Poderes",
      "Magias",
      "Inventário",
    ]) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await nav.getByRole("button", { name, exact: true }).tap();
      await expect(
        nav.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      // Selecting a different area opens its heading, even after scrolling a long list.
      if (name !== "Ficha")
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      if (width <= 900) {
        await touchTarget(nav.getByRole("button", { name, exact: true }));
        await touchTarget(
          page.getByRole("button", { name: "Abrir ferramentas", exact: true }),
        );
        if (["Ficha", "Combate"].includes(name)) {
          for (const action of [
            "Receber dano",
            "Recuperar PV",
            "Gastar PM",
            "Recuperar PM",
          ])
            await touchTarget(
              page.getByRole("button", { name: action, exact: true }),
            );
        }
      }
    }
    if (width <= 900) {
      await touchTarget(
        page.getByRole("button", {
          name: "Editar Marreta certeira",
          exact: true,
        }),
      );
      await page
        .getByRole("button", { name: "Abrir ferramentas", exact: true })
        .tap();
      await dialogFits(page);
      await expect(page.getByRole("dialog")).toContainText(
        "Livro de referência",
      );
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Abrir ferramentas", exact: true }),
      ).toBeFocused();
    }
  });
}

test("celular: atalhos, dano, histórico e inventário funcionam com toque", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadBudrik(page);
  await page
    .getByRole("navigation", { name: "Atalhos da ficha" })
    .getByRole("button", { name: "Ataques", exact: true })
    .tap();
  await expect(page.locator("#sheet-attacks")).toBeFocused();
  const top = (await page.locator("#sheet-attacks").boundingBox())!.y;
  expect(top).toBeGreaterThanOrEqual(64);
  expect(top).toBeLessThan(110);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Combate", exact: true })
    .tap();
  await page.getByRole("button", { name: "Receber dano", exact: true }).tap();
  await dialogFits(page);
  await page.getByLabel("Dano original").fill("5");
  await page.getByLabel("Perda de vida (ignora RD e temporários)").check();
  await page.setViewportSize({ width: 390, height: 500 });
  await dialogFits(page);
  await page
    .getByRole("button", { name: "Aplicar alteração", exact: true })
    .tap();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.locator(".resource-card.hp .resource-value > strong"),
  ).toHaveText("64");
  await page
    .getByRole("button", { name: "Abrir ferramentas", exact: true })
    .tap();
  await page.getByRole("button", { name: /Histórico da aventura/ }).tap();
  await dialogFits(page);
  await page
    .getByRole("button", { name: "Desfazer última operação", exact: true })
    .tap();
  await page.getByRole("button", { name: "Fechar", exact: true }).tap();
  await expect(
    page.locator(".resource-card.hp .resource-value > strong"),
  ).toHaveText("69");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Inventário", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Editar Machado de guerra", exact: true })
    .tap();
  await dialogFits(page);
  await page.getByLabel("Quantidade", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Salvar item", exact: true }).tap();
  await expect(
    page
      .locator(".inventory-row")
      .filter({
        has: page.getByRole("button", {
          name: "Editar Machado de guerra",
          exact: true,
        }),
      })
      .locator(".quantity"),
  ).toHaveText("2");
  await page.reload();
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
});

test("320px: edição, evolução, condições e catálogos ficam dentro das janelas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loadBudrik(page);
  await page.getByRole("button", { name: "Editar ficha", exact: true }).tap();
  for (const name of [
    "Identidade",
    "Atributos e perícias",
    "Ataques",
    "Ajustes",
    "Escolhas internas",
  ]) {
    await page
      .locator(".tabs")
      .getByRole("button", { name, exact: true })
      .tap();
    await dialogFits(page);
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Evoluir", exact: true }).tap();
  for (const name of ["Classe", "Poder", "Magias", "Comparação"]) {
    await page
      .locator(".tabs")
      .getByRole("button", { name, exact: true })
      .tap();
    await dialogFits(page);
  }
  await page.keyboard.press("Escape");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Combate", exact: true })
    .tap();
  await page.getByRole("button", { name: "Adicionar", exact: true }).tap();
  await dialogFits(page);
  await page.getByRole("button", { name: "Fraco", exact: true }).tap();
  await dialogFits(page);
  await page.keyboard.press("Escape");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Poderes", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Adicionar poder", exact: true })
    .tap();
  await dialogFits(page);
  await page.keyboard.press("Escape");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Inventário", exact: true })
    .tap();
  await page.getByRole("button", { name: "Adicionar item", exact: true }).tap();
  await dialogFits(page);
  await page
    .getByRole("button", { name: "Item personalizado", exact: true })
    .tap();
  await dialogFits(page);
});

test("390px: magias mostram aprimoramentos e confirmação acessível", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const c = hero("arcanista", 3);
  const spell = acquisition(entryNamed("Armadura Arcana")!.id, 1, "arcanista");
  spell.mode = "spell";
  spell.prepared = true;
  c.acquisitions.push(spell);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Abrir ferramentas", exact: true })
    .tap();
  await page.getByRole("button", { name: /Backups e importação/ }).tap();
  await page.locator("input[type=file]").setInputFiles({
    name: "mago.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "tormenta-personagens",
        schema: 1,
        catalog: RULESET,
        exportedAt: new Date().toISOString(),
        characters: [c],
        history: [],
      }),
    ),
  });
  await page.getByRole("button", { name: "Importar como cópias" }).tap();
  await expect(page.locator(".character-banner h2")).toHaveText("Aldren");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Magias", exact: true })
    .tap();
  await page.getByRole("button", { name: "Lançar", exact: true }).tap();
  await dialogFits(page);
  await page
    .getByText("Condições de conjuração e componentes", { exact: true })
    .tap();
  await dialogFits(page);
  await page.setViewportSize({ width: 390, height: 500 });
  await dialogFits(page);
  await touchTarget(
    page.getByRole("button", { name: "Lançar magia", exact: true }),
  );
  await page.getByRole("button", { name: "Lançar magia", exact: true }).tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("320px: criação mantém a etapa visível e formulários dentro da tela", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Criar personagem", exact: true })
    .tap();
  await page.getByLabel("Nome do personagem", { exact: true }).fill("Aurora");
  for (let i = 0; i < 11; i++) {
    await dialogFits(page);
    const active = page.locator('.wizard-nav [aria-current="step"]');
    const box = (await active.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(
      await page.locator(".modal-body").evaluate((el) => el.scrollTop),
    ).toBe(0);
    expect(
      await page
        .locator(
          ".wizard-content input:not([type=checkbox]), .wizard-content select, .wizard-content textarea",
        )
        .evaluateAll((els) =>
          els.every((el) => parseFloat(getComputedStyle(el).fontSize) >= 16),
        ),
    ).toBe(true);
    await page.locator(".modal-body").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    if (i < 10)
      await page.getByRole("button", { name: "Continuar", exact: true }).tap();
  }
  await page.getByRole("button", { name: "Fechar", exact: true }).tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("320px: ferramentas abrem o livro com navegação e zoom utilizáveis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Abrir ferramentas", exact: true })
    .tap();
  await page.getByRole("button", { name: /Livro de referência/ }).tap();
  await expect(page.locator(".book-pdf canvas")).toBeVisible();
  await dialogFits(page);
  const controls = await page
    .locator(".book-toolbar button, .book-toolbar select, .book-toolbar a")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name: el.getAttribute("aria-label") || el.textContent,
          left: r.left,
          right: r.right,
          height: r.height,
        };
      }),
    );
  for (const control of controls) {
    expect(control.left, String(control.name)).toBeGreaterThanOrEqual(0);
    expect(control.right, String(control.name)).toBeLessThanOrEqual(320);
    expect(control.height, String(control.name)).toBeGreaterThanOrEqual(44);
  }
  await page.getByLabel("Página do livro").fill("32");
  await expect(page.locator(".book-pdf-text")).toContainText("Classes");
  await page.getByRole("button", { name: "Próxima", exact: true }).tap();
  await expect(page.getByLabel("Página do livro")).toHaveValue("33");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Abrir ferramentas", exact: true })
    .tap();
  await page.getByRole("button", { name: /Backups e importação/ }).tap();
  await dialogFits(page);
});
