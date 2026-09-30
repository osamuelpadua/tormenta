import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const shots = ".cache/screenshots/campaigns";
async function shot(page: Page, name: string) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function openAccount(page: Page) {
  await page.locator(".sidebar .account-status").click();
  return page.getByRole("dialog");
}
async function signUp(page: Page, name: string, email: string) {
  const dialog = await openAccount(page);
  await dialog.getByRole("tab", { name: "Criar conta" }).click();
  await dialog.getByLabel("Como quer ser chamado").fill(name);
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByLabel("Senha").fill("segredo123");
  await dialog.locator("form button.primary").click();
  await expect(dialog.getByText(email)).toBeVisible();
  return dialog;
}
async function signIn(page: Page, email: string) {
  const dialog = await openAccount(page);
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByLabel("Senha").fill("segredo123");
  await dialog.locator("form button.primary").click();
  await expect(dialog.getByText(email)).toBeVisible();
  await page.keyboard.press("Escape");
}
async function signOut(page: Page) {
  const dialog = await openAccount(page);
  await dialog.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page.locator(".sidebar .account-status")).toContainText(
    "Entrar na sua conta",
  );
}

test("mestre cria a campanha, o jogador entra e o mestre cura a ficha", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Budrik" })).toBeVisible();

  // The master needs no character: Budrik stays on this device.
  const account = await signUp(page, "Mestre Arsenal", "mestre@mesa.dev");
  await expect(account.getByText("Fichas só deste aparelho")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name: "Campanhas" })
    .click();
  await expect(page.getByText("Nenhuma campanha ainda")).toBeVisible();
  await page.getByRole("button", { name: "Nova campanha" }).click();
  await page.getByLabel("Nome da campanha").fill("A Flecha de Fogo");
  await page.getByRole("button", { name: "Criar campanha" }).click();
  const code = (await page.locator(".invite-code").innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  await shot(page, "01-convite");
  await signOut(page);

  // A player joins through the invite link and brings Budrik.
  await signUp(page, "Ana", "ana@mesa.dev");
  await page.keyboard.press("Escape");
  await page.goto(`/#campaigns?invite=${code}`);
  await expect(page.getByLabel("Código de convite")).toHaveValue(code);
  await page.getByRole("button", { name: "Entrar na campanha" }).click();
  await page.getByRole("button", { name: "Levar para a campanha" }).click();
  const card = page.locator(".party-card", { hasText: "Budrik" });
  await expect(card).toContainText("Ana · você");
  await expect(card).toContainText("69/98");
  await shot(page, "02-grupo-jogador");
  await signOut(page);

  // The master sees the table and heals the player's character.
  await signIn(page, "mestre@mesa.dev");
  await page.goto("/#campaigns");
  await page.getByRole("button", { name: /A Flecha de Fogo/ }).click();
  const table = page.getByRole("region", { name: "Mesa do mestre" });
  const seat = table.locator(".party-card", { hasText: "Budrik" });
  await expect(seat).toContainText("Ana");
  await seat.getByRole("button", { name: "Curar" }).click();
  const heal = page.getByRole("dialog", { name: "Pontos de vida" });
  await heal.getByLabel("Quantidade").fill("5");
  await heal.getByLabel("Origem da alteração").fill("Poção do mestre");
  await heal.getByRole("button", { name: "Aplicar alteração" }).click();
  await expect(seat).toContainText("74/98");
  await shot(page, "03-mesa-do-mestre");

  // The master opens the sheet: effects only, no editing.
  await seat.getByRole("button", { name: /Budrik/ }).click();
  await expect(
    page.getByText("FICHA DO JOGADOR · VISÃO DO MESTRE"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Editar características" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Receber dano" }),
  ).toBeVisible();
  await expect(page.getByText("por Mestre Arsenal")).toBeVisible();
  await shot(page, "04-ficha-visao-mestre");
  await signOut(page);

  // Back as the player: the healing arrived with its author.
  await signIn(page, "ana@mesa.dev");
  await page.goto("/#sheet");
  await expect(page.getByRole("heading", { name: "Budrik" })).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Pontos de vida" }),
  ).toHaveAttribute("aria-valuenow", "74");
});

test("um jogador vê a ficha do grupo apenas para leitura", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Budrik" })).toBeVisible();
  await signUp(page, "Mestre", "m2@mesa.dev");
  await page.keyboard.press("Escape");
  await page.goto("/#campaigns");
  await page.getByRole("button", { name: "Nova campanha" }).click();
  await page.getByLabel("Nome da campanha").fill("Mesa de teste");
  await page.getByRole("button", { name: "Criar campanha" }).click();
  const code = (await page.locator(".invite-code").innerText()).trim();
  await signOut(page);

  await signUp(page, "Ana", "a2@mesa.dev");
  await page.keyboard.press("Escape");
  await page.goto(`/#campaigns?invite=${code}`);
  await page.getByRole("button", { name: "Entrar na campanha" }).click();
  await page.getByRole("button", { name: "Levar para a campanha" }).click();
  await expect(
    page.locator(".party-card", { hasText: "Budrik" }),
  ).toBeVisible();
  await signOut(page);

  await signUp(page, "Bruno", "b2@mesa.dev");
  await page.keyboard.press("Escape");
  await page.goto(`/#campaigns?invite=${code}`);
  await page.getByRole("button", { name: "Entrar na campanha" }).click();
  const card = page.locator(".party-card", { hasText: "Budrik" });
  await expect(card).toContainText("Ana");
  await card.getByRole("button", { name: /Budrik/ }).click();
  await expect(page.getByText("Somente leitura.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Receber dano" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /Atacar com/ })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "05-ficha-grupo-celular");
});
