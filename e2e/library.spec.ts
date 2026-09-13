import { test, expect } from "@playwright/test";

for (const width of [1440, 390])
  test(`biblioteca em ${width}px: filtros, detalhes, PDF e histórico preservam a consulta`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#powers");
    await page.getByRole("button", { name: /Biblioteca de Poderes/ }).click();
    await expect(page.locator(".power-card")).toHaveCount(24);
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    await page.getByLabel("Classe", { exact: true }).selectOption("guerreiro");
    await page
      .getByLabel("Tipo de conteúdo", { exact: true })
      .selectOption("classPower");
    await page.getByPlaceholder("Pesquisar poderes…").fill("arma");
    await page.getByRole("button", { name: /Ver \d+ resultados/ }).click();
    await page.getByLabel("Ordenar resultados").selectOption("page");
    const card = page.locator(".power-card").nth(2);
    await card.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    const name = (await card.locator(".power-title").innerText()).trim();
    await card.locator(".power-title").click();
    const detail = page.getByRole("dialog", { name, exact: true });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Requisitos pendentes");
    const book = detail.getByRole("button", { name: /Ver no livro/ });
    const printed = Number((await book.innerText()).match(/p\. (\d+)/)![1]);
    await book.click();
    await expect(page.locator(".book-pdf canvas")).toHaveAttribute(
      "aria-label",
      `Página ${printed} do livro original · PDF ${printed + 6}`,
    );
    await expect(
      page.locator(".book-pdf-highlights > span").first(),
    ).toBeVisible();
    await expect(page.locator(".reader-zoom-label")).toHaveText(
      width === 390 ? "200%" : "115%",
    );
    await page.getByRole("button", { name: "Próxima", exact: true }).click();
    await expect(
      page.getByLabel("Página do livro", { exact: true }),
    ).toHaveValue(String(printed + 1));
    await page.goBack();
    await expect(page.locator(".book-reader")).toHaveCount(0);
    await expect(detail).toBeVisible();
    await page.goForward();
    await expect(page.locator(".book-pdf canvas")).toBeVisible();
    await page.reload();
    await expect(page.locator(".book-pdf canvas")).toBeVisible();
    await page
      .getByRole("button", { name: "Voltar ao conteúdo", exact: true })
      .click();
    await expect(page.locator(".book-reader")).toHaveCount(0);
    await detail.locator(".modal-heading button").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByPlaceholder("Pesquisar poderes…")).toHaveValue(
      "arma",
    );
    await expect(page.getByLabel("Ordenar resultados")).toHaveValue("page");
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - before),
    ).toBeLessThan(80);
    await page.reload();
    await expect(page.getByPlaceholder("Pesquisar poderes…")).toHaveValue(
      "arma",
    );
    await expect(page.getByLabel("Ordenar resultados")).toHaveValue("page");
    await page.getByRole("button", { name: /Filtros \(2\)/ }).click();
    await expect(page.getByLabel("Classe", { exact: true })).toHaveValue(
      "guerreiro",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
  });

test("inventário: consulta destacada preserva a edição e zoom rápido não oculta o PDF", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#inventory");
  await page
    .getByRole("button", { name: "Editar Marreta certeira", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Marreta em revisão");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Ver no livro/ })
    .click();
  await expect(page.locator(".book-pdf canvas")).toHaveAttribute(
    "aria-label",
    "Página 149 do livro original · PDF 155",
  );
  await expect(
    page.locator(".book-pdf-highlights > span").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Zoom e opções", exact: true })
    .click();
  await page.locator(".book-pdf-scroll").evaluate((scroll) => {
    const host = scroll.querySelector(".book-pdf-host")!;
    const observation = { hidden: 0, replacements: 0 };
    (window as any).zoomObservation = observation;
    const observer = new MutationObserver((records) => {
      observation.replacements += records.filter(
        (r) => r.type === "childList",
      ).length;
    });
    observer.observe(host, { childList: true });
    const end = performance.now() + 1800;
    const frame = () => {
      if (!host.checkVisibility({ checkVisibilityCSS: true }))
        observation.hidden++;
      if (performance.now() < end) requestAnimationFrame(frame);
      else observer.disconnect();
    };
    frame();
  });
  await page
    .getByRole("button", { name: "Aumentar zoom", exact: true })
    .click({ clickCount: 4, delay: 30 });
  await expect(page.locator(".book-pdf-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    (await page.evaluate(() => (window as any).zoomObservation)).hidden,
  ).toBe(0);
  expect(
    (await page.evaluate(() => (window as any).zoomObservation)).replacements,
  ).toBeLessThanOrEqual(2);
  await page
    .getByRole("button", { name: "Voltar à consulta", exact: true })
    .click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(
    "Marreta em revisão",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.locator(".inventory-row").filter({ hasText: "Marreta certeira" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("acervo: paginação, filtros de magia e aquisição usam os registros existentes", async ({
  page,
}) => {
  await page.goto("/#spells");
  await page.getByRole("button", { name: /Biblioteca de Magias/ }).click();
  await expect(page.locator(".power-card")).toHaveCount(24);
  await page
    .getByRole("button", { name: "Próximos resultados", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Páginas de resultados" }),
  ).toContainText("2 / 9");
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Páginas de resultados" }),
  ).toContainText("2 / 9");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page
    .getByLabel("Lista básica de classe", { exact: true })
    .selectOption("arcanista");
  await page.getByLabel("Escola", { exact: true }).selectOption("Evocação");
  await page.getByLabel("Círculo", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: /Ver \d+ resultados/ }).click();
  await expect(page.locator(".power-card").first()).toContainText(
    "5º · Evocação",
  );
  await expect(page.locator(".power-card").first()).toContainText(
    "Conferir aprendizagem",
  );
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Poderes", exact: true })
    .click();
  await page.getByRole("button", { name: /Biblioteca de Poderes/ }).click();
  await page.getByPlaceholder("Pesquisar poderes…").fill("Sortudo");
  await page.getByRole("button", { name: "Sortudo", exact: true }).click();
  await page
    .getByRole("button", { name: "Preparar aquisição", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Biblioteca de poderes e habilidades" }),
  ).toBeVisible();
  await page
    .getByLabel("Origem e motivo", { exact: true })
    .fill("Treino autorizado na mesa");
  await page
    .getByRole("button", { name: "Salvar escolhas (1)", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByPlaceholder("Pesquisar poderes…")).toHaveValue(
    "Sortudo",
  );
  await page.getByRole("button", { name: /Meus Poderes/ }).click();
  await expect(page.locator(".power-card")).toHaveCount(1);
  await expect(page.locator(".power-card")).toContainText("Já possui");
  await page.getByRole("button", { name: "Sortudo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preparar aquisição", exact: true }),
  ).toHaveCount(0);
});
