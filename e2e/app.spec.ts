import { test, expect, type Page } from "@playwright/test";
import { hero, equip } from "../tests/fixtures";
import { RULESET, entryNamed } from "../src/data/rules";
import { acquisition } from "../src/domain/character";
import type { Character } from "../src/domain/types";
import { mkdir } from "node:fs/promises";

async function importCharacter(page: Page, character?: Character) {
  const c = character ?? hero();
  if (!character) {
    equip(c, "espada-longa");
    equip(c, "armadura-de-couro");
  }
  const backup = {
    format: "tormenta-personagens",
    schema: 1,
    catalog: RULESET,
    exportedAt: new Date().toISOString(),
    characters: [c],
    history: [],
  };
  await page.goto("/");
  await page
    .getByRole("button", { name: "Backups e importação", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "personagem.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "Importar como cópias" }).click();
  await expect(page.locator(".character-banner h2")).toHaveText("Aldren");
}
async function nav(page: Page, name: string) {
  await page
    .locator(".main-nav")
    .getByRole("button", { name, exact: true })
    .click();
}
test("cria um personagem pelas escolhas do assistente sem exceções", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Novo personagem", exact: true })
    .click();
  await page.getByLabel("Nome do personagem", { exact: true }).fill("Aurora");
  await page.getByLabel("Jogador", { exact: true }).fill("Samuel");
  await page.locator(".wizard-nav button").nth(1).click();
  for (const [name, steps] of [
    ["Força", 3],
    ["Destreza", 2],
    ["Constituição", 2],
    ["Inteligência", 1],
    ["Sabedoria", 1],
  ] as const) {
    for (let i = 0; i < steps; i++)
      await page
        .getByRole("button", { name: `Aumentar ${name}`, exact: true })
        .click();
  }
  await expect(
    page.getByText("0 pontos disponíveis", { exact: true }),
  ).toBeVisible();
  await page.locator(".wizard-nav button").nth(6).click();
  const group = (heading: string) =>
    page.locator(".wizard-section").filter({
      has: page.getByRole("heading", { name: heading, exact: true }),
    });
  await group("Treinamentos da classe")
    .getByLabel("Atletismo", { exact: true })
    .check();
  await group("Treinamentos da classe")
    .getByLabel("Iniciativa", { exact: true })
    .check();
  await group("Inteligência").getByLabel("Percepção", { exact: true }).check();
  await group("Benefícios raciais")
    .getByLabel("Diplomacia", { exact: true })
    .check();
  await group("Benefícios raciais")
    .getByLabel("Sobrevivência", { exact: true })
    .check();
  await page.locator(".wizard-nav button").nth(8).click();
  await page
    .getByRole("button", {
      name: "Adicionar equipamento inicial e informar T$ 4d6 da mesa",
      exact: true,
    })
    .click();
  for (let i = 1; i <= 4; i++)
    await page.getByLabel(`Dado ${i} (d6)`).fill("4");
  await page.getByRole("button", { name: "Confirmar dados" }).click();
  await page.locator(".wizard-nav button").nth(10).click();
  await expect(
    page.getByText("Escolhas conferidas. Seu personagem está pronto."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Criar personagem", exact: true })
    .click();
  await expect(page.locator(".character-banner h2")).toHaveText("Aurora");
  await expect(
    page.locator(".resource-card.hp .resource-value>strong"),
  ).toHaveText("23");
  await page.reload();
  await expect(page.locator(".character-banner h2")).toHaveText("Aurora");
  expect(errors).toEqual([]);
});
test("combate, dano, desfazer, evolução, backup e retorno offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await importCharacter(page);
  await mkdir(".cache/screenshots", { recursive: true });
  await page.screenshot({
    path: ".cache/screenshots/ficha-desktop.png",
    fullPage: true,
  });
  await nav(page, "Combate");
  await page.getByLabel("Iniciativa", { exact: true }).fill("15");
  await page
    .getByRole("button", { name: "Iniciar combate", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Iniciar meu turno", exact: true })
    .click();
  await page.getByRole("button", { name: "Receber dano", exact: true }).click();
  await page.getByLabel("Dano original").fill("5");
  await page
    .getByRole("button", { name: "Aplicar alteração", exact: true })
    .click();
  await expect(
    page.locator(".resource-card.hp .resource-value>strong"),
  ).toHaveText("18");
  await page.getByRole("button", { name: "Abrir histórico" }).click();
  await expect(
    page.getByRole("heading", { name: "Dano recebido", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Desfazer última operação", exact: true })
    .click();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(
    page.locator(".resource-card.hp .resource-value>strong"),
  ).toHaveText("23");
  await page
    .getByRole("button", { name: "Atacar com Espada longa", exact: true })
    .click();
  await page.getByLabel("Defesa do alvo (opcional)").fill("10");
  await page
    .getByRole("button", { name: "Registrar ataque", exact: true })
    .click();
  await page.getByLabel("Dado 1 (d20)").fill("12");
  await page.getByRole("button", { name: "Confirmar dados" }).click();
  await page.getByLabel("Dado 1 (d8)").fill("5");
  await page.getByRole("button", { name: "Confirmar dados" }).click();
  await expect(
    page.locator(".action-slots>div").first().locator("strong"),
  ).toHaveText("0");
  await page
    .getByRole("button", { name: "Encerrar meu turno", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avançar para a rodada 2", exact: true })
    .click();
  await expect(page.getByText("Rodada 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByRole("button", { name: "Fraco", exact: true }).click();
  await page
    .getByLabel("Origem e motivo", { exact: true })
    .fill("Veneno, informado pelo mestre");
  await page
    .getByRole("button", { name: "Aplicar efeito", exact: true })
    .click();
  await expect(page.locator(".condition-pills")).toContainText("Fraco");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".character-banner h2")).toHaveText("Aldren");
  await expect(page.getByText("Rodada 2", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Encerrar a cena e o combate" })
    .click();
  await page.getByRole("button", { name: "Evoluir", exact: true }).click();
  await page
    .locator(".tabs")
    .getByRole("button", { name: "Poder", exact: true })
    .click();
  await page.getByPlaceholder("Pesquisar poderes…").fill("Vitalidade");
  await page.locator(".picker-entry").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar evolução" }).click();
  await expect(page.locator(".level-seal strong")).toHaveText("2");
  await expect(
    page.locator(".resource-card.hp .resource-value>strong"),
  ).toHaveText("23");
  await page.getByRole("button", { name: "Backups e importação" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar personagens/ }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  await page.locator("input[type=file]").setInputFiles(backupPath!);
  await page.getByRole("button", { name: "Importar como cópias" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The full backup includes Budrik; UUID order does not identify Aldren.
  await page
    .locator("#character-select")
    .selectOption({ label: "Aldren (cópia)" });
  await expect(page.locator(".character-banner h2")).toHaveText(
    "Aldren (cópia)",
  );
  expect(errors).toEqual([]);
});
test("celular, teclado, pesquisa de perícia e catálogo offline", async ({
  page,
  context,
}) => {
  await importCharacter(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Personagem no celular" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar personagem", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByPlaceholder("Pesquisar perícia…").fill("Luta");
  await page.locator(".skill-row").click();
  await expect(page.getByRole("dialog")).toContainText("Luta");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Inventário", exact: true })
    .click();
  await expect(page.locator(".inventory-row")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".cache/screenshots/inventario-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Editar Espada longa" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Livro de referência", exact: true })
    .click();
  await expect(page.locator(".book-page")).toContainText("Atributos");
  await page.getByLabel("Página do livro").fill("233");
  await page.getByLabel("Página do livro").press("Enter");
  await expect(page.locator(".book-page")).toContainText("rodada");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.getByLabel("Página do livro").fill("394");
  await page.getByLabel("Página do livro").press("Enter");
  await expect(page.locator(".book-page")).toContainText("Abalado");
});

test("falha de concentração preserva custos e registra o resultado", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        array.fill(0);
        return array;
      },
    });
  });
  const c = hero("arcanista", 3),
    ac = acquisition(entryNamed("Armadura Arcana")!.id, 1, "arcanista");
  ac.mode = "spell";
  ac.prepared = true;
  c.acquisitions.push(ac);
  await importCharacter(page, c);
  await nav(page, "Magias");
  await page
    .locator(".power-card")
    .filter({
      has: page.getByRole("button", { name: "Armadura Arcana", exact: true }),
    })
    .getByRole("button", { name: "Lançar", exact: true })
    .click();
  await page
    .getByText("Condições de conjuração e componentes", { exact: true })
    .click();
  await page.getByLabel("Concentração", { exact: true }).selectOption("bad");
  await page.getByRole("button", { name: "Lançar magia", exact: true }).click();
  await page.getByLabel("Dado 1 (d20)").fill("1");
  await page.getByRole("button", { name: "Confirmar dados" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Ficha");
  await expect(
    page.locator(".resource-card.mp .resource-value>strong"),
  ).toHaveText(String(c.mp - 1));
  await page.getByRole("button", { name: "Abrir histórico" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "falha; PM e componentes consumidos",
  );
  expect(errors).toEqual([]);
});

test("forma selvagem recalcula a ficha e pode ser desfeita", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const c = hero("druida", 6);
  for (const name of ["Forma Selvagem", "Forma Selvagem Aprimorada"])
    c.acquisitions.push(acquisition(entryNamed(name)!.id, 2, "druida"));
  await importCharacter(page, c);
  await nav(page, "Poderes");
  await page
    .locator(".power-card")
    .filter({
      has: page.getByRole("button", { name: "Forma Selvagem", exact: true }),
    })
    .getByRole("button", { name: "Usar", exact: true })
    .click();
  await page
    .getByLabel("Forma selvagem", { exact: true })
    .selectOption("feroz");
  await page.getByLabel("Patamar da transformação").selectOption("aprimorada");
  await page
    .getByRole("button", { name: "Usar habilidade", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Ficha");
  await expect(page.getByText("Grande", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Arma natural · forma Feroz", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".resource-card.mp .resource-value>strong"),
  ).toHaveText(String(c.mp - 6));
  await page.getByRole("button", { name: "Abrir histórico" }).click();
  await page.getByRole("button", { name: /Desfazer/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Médio", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
