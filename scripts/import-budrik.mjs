import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { emptyCharacter, acquisition, itemFromTemplate, automaticEntries } =
    await server.ssrLoadModule("/src/domain/character.ts");
  const { RULESET, CATALOG } = await server.ssrLoadModule("/src/data/rules.ts");
  const { calculate } = await server.ssrLoadModule("/src/domain/calculate.ts");
  const { parseBackup } = await server.ssrLoadModule("/src/storage/schema.ts");
  const c = emptyCharacter();
  c.id = "ficha-budrik-samuel-2026-09-12";
  c.name = "Budrik";
  c.player = "Samuel";
  c.age = 55;
  c.raceId = "anao";
  c.originId = CATALOG.find(
    (e) => e.kind === "origin" && e.name === "Soldado",
  ).id;
  c.deityId = "";
  // Printed scores already include ancestry. Store the initial scores so the
  // engine applies the dwarf's +2 CON, +1 SAB and -1 DES exactly once.
  c.attributes = { for: 4, des: 3, con: 4, int: 1, sab: 2, car: 1 };
  c.racialChoices = [];
  c.levels = Array.from({ length: 6 }, () => ({
    classId: "barbaro",
    powers: [],
    notes: "Nível transcrito da ficha; ordem das escolhas não informada.",
  }));
  c.choices = { attributeMode: "manual", showCarriedAttacks: "sim" };
  c.hp = 69;
  c.mp = 12;
  c.xp = 15150;
  c.advancement = "xp";
  c.coins.ts = 298;
  c.concept =
    "Anão soldado, bárbaro de nível 6. Transcrito de ficha manuscrita.";
  c.trained = [
    "fortitude",
    "luta",
    "iniciativa",
    "intimidacao",
    "percepcao",
    "pontaria",
    "sobrevivencia",
  ].map((id) => ({
    id,
    level: 1,
    source:
      "Ficha fotografada — treinamento marcado; origem da escolha não informada",
  }));
  for (const name of [
    "Estilo de Duas Mãos",
    "Brado Assustador",
    "Sangue de Ferro",
    "Ataque Poderoso",
    "Investida Imprudente",
    "Vigor Primal",
  ]) {
    const entry = CATALOG.find((e) => e.name === name);
    if (!entry) throw new Error(`Poder não encontrado: ${name}`);
    c.acquisitions.push(
      acquisition(
        entry.id,
        6,
        "Ficha fotografada — nível de aquisição não informado",
      ),
    );
  }
  const equip = (templateId, state = "carried") => {
    const item = itemFromTemplate(templateId);
    item.state = state;
    item.notes +=
      "\nPresente na ficha fotografada. Quantidade assumida: 1; números na margem parecem indicar espaços.";
    c.inventory.push(item);
    return item;
  };
  const hammer = equip("marreta", "wielded");
  hammer.name = "Marreta certeira";
  hammer.improvements.push("Certeira");
  hammer.notes +=
    "\nFicha: ataque 11; dano 3d4+4; crítico ×2; impacto. Apenas esta arma foi marcada como empunhada para não ocupar quatro mãos.";
  const axe = equip("machado-de-guerra");
  axe.notes += "\nFicha: ataque 10; dano 1d12+4; crítico ×3; corte.";
  equip("gibao-de-peles", "worn");
  for (const id of [
    "mochila",
    "saco-de-dormir",
    "traje-de-viajante",
    "bandoleira-de-pocoes",
    "corda",
    "botas-reforcadas",
    "equipamento-de-viagem",
  ])
    equip(id);
  const customItem = (name, notes, spaces = 1) => {
    const item = itemFromTemplate("corda");
    delete item.templateId;
    delete item.entryId;
    Object.assign(item, {
      name,
      category: "Equipamento de aventura",
      notes,
      price: 0,
      spaces,
      benefit: false,
    });
    c.inventory.push(item);
  };
  customItem(
    "Uniforme militar e insígnia",
    "Anotado junto à mochila; quantidade, preço e espaços não informados.",
    0,
  );
  customItem(
    "Poção de cura",
    "Leitura provável do item ao lado do saco de dormir. Quantidade assumida: 1. Potência e efeito não legíveis; nenhum efeito foi inventado.",
  );
  customItem(
    "Água",
    "Leitura provável na linha anterior ao machado. Recipiente e volume não informados.",
  );
  c.notes = [
    "TRANSCRIÇÃO DA FICHA FOTOGRAFADA — 12/09/2026",
    "Nome lido como Budrik; jogador Samuel; idade 55; anão; Soldado; Bárbaro 6.",
    "Divindade: manuscrito pouco legível, leitura aproximada ‘Khor-Dar’. Mantido sem vínculo a um deus do catálogo até confirmação.",
    "Atributos finais da foto: FOR 4, DES 2, CON 6, INT 1, SAB 3, CAR 1. Os atributos iniciais descontam os ajustes raciais.",
    "Recursos: PV máximo 98; PM máximo 18; PM atual 12. PV atuais: aparecem 25 / 74 / 69 e outros traços. Usado 69 com autorização do jogador para escolher um valor e editar depois. Nenhuma cura ou descanso aplicado.",
    "XP: usado o último total legível, 15.150. A margem lista: 625 / 825 / 1200 / 2000 / 2150 / 2300 / 3050 / 3200 / 5300 / 5400 / 6000 / 6300 / 8600 / 9000 / 13000 / 13870 / 14070 / 14400 / 15150. Alguns totais intermediários são incertos.",
    "Moedas: leitura provável T$ 298; editar se necessário. Carga total não legível. Números ao lado dos equipamentos tratados como espaços, não como quantidade.",
    "Defesa anotada: 16 = 10 + DES 2 + gibão de peles 4; penalidade da armadura -3. Proficiências: armas marciais e escudos.",
    "Ataques na foto: Marreta (certeira), ataque 11, 3d4+4, crítico ×2, impacto; Machado de guerra, ataque 10, 1d12+4, crítico ×3, corte. Esses totais parecem não incluir todos os bônus raciais/de poderes. Os ataques do sistema calculam os bônus possuídos; os totais originais ficam preservados aqui, sem impor penalidades para reproduzir possível conta desatualizada.",
    "Perícias marcadas: Fortitude 11 (3+6+2); Iniciativa 7 (3+2+2); Intimidação 6 (3+1+2); Luta 9 (3+4+2); Percepção 9 (3+3+2+1); Pontaria 7 (3+2+2); Sobrevivência 8 (3+3+2). Reflexos: total pouco legível, parece 4; sem marca clara de treinamento. Perícias em branco não foram tratadas como valor zero.",
    "HABILIDADES DA FOTO",
    "Conhecimento das Rochas: visão no escuro; +2 em Percepção e Sobrevivência no subterrâneo.",
    "Devagar e Sempre: deslocamento 6 m, não reduzido por armadura/carga.",
    "Duro como Pedra: +3 PV no nível 1 e +1 PV por nível seguinte.",
    "Tradição de Heredrimm: familiaridade com armas anãs e +2 em ataque.",
    "Fúria +2: +2 em ataque e dano; referência manuscrita p. 41.",
    "Estilo de Duas Mãos: +5 em dano. Brado Assustador.",
    "Sangue de Ferro: 3 PM, RD 5, +2 em rolagens de dano.",
    "Poder de Heróis de Arton, p. 57: nome pouco legível, termina em ‘Selvagem’; anotação ‘soma bônus da fúria em Defesa, Fortitude e RD’. Preservado como anotação; fonte complementar não fornecida, efeito não aplicado automaticamente.",
    "Instinto Selvagem: +1 em dano, Percepção e Reflexos (conforme anotação da foto e comportamento atual do motor).",
    "Ataque Poderoso: +5 dano, -2 ataque; referência manuscrita p. 124.",
    "Investida Imprudente: bônus 1d12 dano, -5 Defesa; referência manuscrita p. 42.",
    "Vigor Primal: 1 PM = 1d12 cura. Redução de Dano 2.",
    "Inventário: mochila / uniforme militar e insígnia; saco de dormir / possível poção de cura; traje de viajante / trecho ilegível; marreta / trecho ilegível; bandoleira de poções; gibão de peles / corda; possível água / poção; machado de guerra; botas reforçadas / equipamento de viagem. Quantidades assumidas como uma unidade cada. Não foram inventados itens para palavras sem leitura segura.",
    "Outras anotações na margem: ‘Kazdrik’, ‘Durgan’, ‘Hilde’, ‘sangue +2’, números e símbolos sem contexto. Leituras provisórias.",
    "A ordem de aquisição dos poderes, a distribuição dos treinamentos entre classe/origem/Inteligência e eventuais concessões do mestre não constam na foto. Revisar ao editar/evoluir; nenhuma escolha extra foi inventada.",
  ].join("\n\n");
  const d = calculate(c);
  if (d.hp.total !== 98 || d.mp.total !== 18 || d.defense.total !== 16)
    throw new Error(
      `Recursos divergentes: ${d.hp.total}/${d.mp.total}/${d.defense.total}`,
    );
  const backup = {
    format: "tormenta-personagens",
    schema: 1,
    catalog: RULESET,
    exportedAt: c.updatedAt,
    characters: [c],
    history: [
      {
        id: "transcricao-budrik-2026-09-12",
        characterId: c.id,
        at: c.updatedAt,
        title: "Ficha manuscrita transcrita",
        detail:
          "Foto fornecida por Samuel. PV atuais 69 escolhidos com autorização; valores incertos documentados em Anotações.",
        kind: "import",
        round: 1,
      },
    ],
  };
  const { warnings } = parseBackup(JSON.stringify(backup));
  if (warnings.length) throw new Error(warnings.join("; "));
  mkdirSync("public/imports", { recursive: true });
  writeFileSync("public/imports/budrik.json", JSON.stringify(backup, null, 2));
  console.log(
    JSON.stringify(
      {
        file: "public/imports/budrik.json",
        name: c.name,
        attributes: Object.fromEntries(
          Object.entries(d.attributes).map(([id, v]) => [id, v.total]),
        ),
        hp: [c.hp, d.hp.total],
        mp: [c.mp, d.mp.total],
        defense: d.defense.total,
        attacks: d.attacks.map((a) => [
          a.name,
          a.toHit.total,
          a.damageExpression,
        ]),
        automatic: automaticEntries(c).map((e) => e.name),
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
