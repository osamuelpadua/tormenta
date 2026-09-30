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

  // Experience for the whole group.
  await table.getByRole("button", { name: "Conceder XP" }).click();
  const grant = page.getByRole("dialog", { name: "Conceder experiência" });
  await grant.getByRole("button", { name: "500", exact: true }).click();
  await grant.getByLabel("Motivo").fill("Resgate do prefeito");
  await grant.getByRole("button", { name: "Conceder XP" }).click();
  await expect(grant).toHaveCount(0);

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
  await expect(page.getByText("por Mestre Arsenal").first()).toBeVisible();
  await shot(page, "04-ficha-visao-mestre");
  await signOut(page);

  // Back as the player: the healing arrived with its author.
  await signIn(page, "ana@mesa.dev");
  await page.goto("/#sheet");
  await expect(page.getByRole("heading", { name: "Budrik" })).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Pontos de vida" }),
  ).toHaveAttribute("aria-valuenow", "74");
  await expect(page.locator(".xp-strip")).toContainText("15.650 XP");
  await shot(page, "05-xp-na-ficha");
});

test("mapa da campanha: o grupo marca locais e o mestre revela segredos", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Budrik" })).toBeVisible();
  await signUp(page, "Mestre", "m3@mesa.dev");
  await page.keyboard.press("Escape");
  await page.goto("/#campaigns");
  await page.getByRole("button", { name: "Nova campanha" }).click();
  await page.getByLabel("Nome da campanha").fill("Mesa do mapa");
  await page.getByRole("button", { name: "Criar campanha" }).click();
  const code = (await page.locator(".invite-code").innerText()).trim();

  await page
    .getByRole("navigation", { name: "Seções da campanha" })
    .getByRole("button", { name: "Mapas" })
    .click();
  await page.getByRole("button", { name: "Adicionar mapa" }).click();
  await page.getByRole("button", { name: "Adicionar à campanha" }).click();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await page.getByRole("button", { name: "Adicionar local" }).click();
  await page.getByRole("button", { name: "Usar centro" }).click();
  await page.getByLabel("Nome do local").fill("Covil oculto");
  await page.getByRole("checkbox", { name: /Local secreto/ }).check();
  await page.getByRole("button", { name: "Salvar local" }).click();
  await expect(page.getByText("Secreto · só mestres veem")).toBeVisible();
  await expect(page.locator(".atlas-pin.secret")).toHaveCount(1);
  await shot(page, "06-mapa-segredo-mestre");
  await page.getByRole("button", { name: "Voltar aos mapas" }).click();
  await signOut(page);

  await signUp(page, "Ana", "a3@mesa.dev");
  await page.keyboard.press("Escape");
  await page.goto(`/#campaigns?invite=${code}`);
  await page.getByRole("button", { name: "Entrar na campanha" }).click();
  await page
    .getByRole("navigation", { name: "Seções da campanha" })
    .getByRole("button", { name: "Mapas" })
    .click();
  await page.getByRole("button", { name: "Abrir Aethelgard" }).click();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await expect(page.locator(".atlas-pin")).toHaveCount(0);
  await expect(page.locator(".atlas-bar-title")).toContainText("0 locais");
  await page.getByRole("button", { name: "Adicionar local" }).click();
  await page.getByRole("button", { name: "Usar centro" }).click();
  await page.getByLabel("Nome do local").fill("Taverna do Javali");
  await expect(
    page.getByRole("checkbox", { name: /Local secreto/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar local" }).click();
  await expect(page.locator(".atlas-bar-title")).toContainText("1 local");
  await page.getByRole("button", { name: "Voltar aos mapas" }).click();
  await signOut(page);

  await signIn(page, "m3@mesa.dev");
  await page.goto("/#campaigns");
  await page.getByRole("button", { name: /Mesa do mapa/ }).click();
  await page
    .getByRole("navigation", { name: "Seções da campanha" })
    .getByRole("button", { name: "Mapas" })
    .click();
  await page.getByRole("button", { name: "Abrir Aethelgard" }).click();
  await expect(page.locator(".atlas-bar-title")).toContainText("2 locais");
  await page.getByRole("button", { name: /^Locais/ }).click();
  await page
    .getByRole("complementary", { name: "Locais do mapa" })
    .getByRole("button", { name: /Covil oculto/ })
    .click();
  await page.getByRole("button", { name: "Revelar ao grupo" }).click();
  await expect(page.getByText("Secreto · só mestres veem")).toHaveCount(0);
  await page
    .getByRole("complementary", { name: "Locais do mapa" })
    .getByRole("button", { name: /Taverna do Javali/ })
    .click();
  await expect(page.getByText("Marcado por Ana")).toBeVisible();
  await shot(page, "07-mapa-mestre-revelou");
  await page.getByRole("button", { name: "Voltar aos mapas" }).click();
  await signOut(page);

  await signIn(page, "a3@mesa.dev");
  await page.goto("/#campaigns");
  await page.getByRole("button", { name: /Mesa do mapa/ }).click();
  await page
    .getByRole("navigation", { name: "Seções da campanha" })
    .getByRole("button", { name: "Mapas" })
    .click();
  await page.getByRole("button", { name: "Abrir Aethelgard" }).click();
  await expect(page.locator(".atlas-bar-title")).toContainText("2 locais");
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

test("convida quem não tem conta, sem empilhar com o convite de instalação", async ({
  page,
}) => {
  const invite = page.getByRole("region", { name: "Jogue com o seu grupo" });
  const install = page.getByRole("region", {
    name: "Leve Tormenta Wiki com você",
  });
  await page.goto("/");
  await expect(invite).toBeVisible();
  await expect(install).toHaveCount(0);
  await invite.getByRole("button", { name: "Agora não" }).click();
  await expect(invite).toHaveCount(0);
  await expect(install).toBeVisible();
  await page.reload();
  await expect(page.locator(".character-banner h2")).toHaveText("Budrik");
  await expect(invite).toHaveCount(0);

  // A week later the invitation returns once; it opens on "Criar conta".
  await page.evaluate(() =>
    localStorage.setItem(
      "tormenta-account-prompt",
      String(Date.now() - 8 * 24 * 60 * 60 * 1000),
    ),
  );
  await page.reload();
  await invite.getByRole("button", { name: "Criar conta" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("tab", { name: "Criar conta" }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog.getByLabel("Como quer ser chamado").fill("Ana");
  await dialog.getByLabel("E-mail").fill("convite@mesa.dev");
  await dialog.getByLabel("Senha").fill("segredo123");
  await dialog.locator("form button.primary").click();
  await expect(dialog.getByText("convite@mesa.dev")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(invite).toHaveCount(0);
});
