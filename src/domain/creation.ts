import {
  ATTRIBUTES,
  CATALOG,
  CLASS_MAP,
  CLASSES,
  ENTRY_MAP,
  POINT_COST,
  RACE_MAP,
  SKILLS,
  classLevel,
  knownSpellCount,
  racialMagic,
  maxCircle,
  slug,
} from "../data/rules";
import { calculate } from "./calculate";
import {
  acquisition,
  classTraining,
  originBenefits,
  validatePrerequisites,
} from "./character";
import type { CatalogEntry, Character } from "./types";
export const selected = (c: Character, key: string): string[] =>
  Array.isArray(c.choices[key]) ? (c.choices[key] as string[]) : [];
export function craftId(c: Character, id: string) {
  return id === "oficio" ? `oficio-${slug(c.crafts[0] ?? "artesão")}` : id;
}
export function initialTraining(c: Character): Character {
  const copy = structuredClone(c);
  const base = classTraining(copy);
  const entries = [
    ...base.mandatory.map((id) => ({
      id: craftId(c, id),
      source: "Classe",
      level: 1,
    })),
    ...["classSkills", "raceSkills", "intSkills", "originSkills"].flatMap(
      (key) =>
        selected(copy, key).map((id) => ({
          id: craftId(c, id),
          source: {
            classSkills: "Classe",
            raceSkills: "Raça",
            intSkills: "Inteligência",
            originSkills: "Origem",
          }[key]!,
          level: 1,
        })),
    ),
  ];
  copy.trained = [...new Map(entries.map((t) => [t.id, t])).values()];
  return copy;
}
export function powerOptions(c: Character, source: string): CatalogEntry[] {
  if (source === "Origem") {
    const e = ENTRY_MAP.get(c.originId);
    const b = originBenefits(c.originId);
    if (e?.description.includes("poder de combate"))
      return CATALOG.filter((e) => e.kind === "power" && e.group === "Combate");
    return b.powers;
  }
  if (source === "Devoção") {
    const deity = ENTRY_MAP.get(c.deityId);
    return CATALOG.filter(
      (e) =>
        e.kind === "power" &&
        e.group === "Concedidos" &&
        deity?.description.includes(e.name),
    );
  }
  if (source === "Raça" && c.raceId === "lefou")
    return CATALOG.filter((e) => e.kind === "power" && e.group === "Tormenta");
  const cls = CLASS_MAP.get(source);
  if (cls)
    return CATALOG.filter(
      (e) =>
        (e.kind === "power" && e.group !== "Concedidos") ||
        (e.kind === "classPower" &&
          e.group === cls.name &&
          !["Bruxo", "Mago", "Feiticeiro"].includes(e.name)),
    );
  return CATALOG.filter((e) => e.kind === "power" && e.group !== "Concedidos");
}
export function spellOptions(c: Character, source: string) {
  if (source === "Raça")
    return CATALOG.filter(
      (e) => e.kind === "spell" && racialMagic(c).options.includes(e.name),
    );
  const circle = maxCircle(c, source);
  const schools = selected(c, "schools");
  const alternateTypes =
    ["bardo", "druida"].includes(source) &&
    c.acquisitions.some(
      (a) =>
        a.source === source &&
        ["Aumentar Repertório", "Segredos da Natureza"].includes(
          ENTRY_MAP.get(a.entryId)?.name ?? "",
        ),
    );
  return CATALOG.filter(
    (e) =>
      e.kind === "spell" &&
      (e.circle ?? 1) <= circle &&
      (alternateTypes ||
        (["arcanista", "bardo"].includes(source)
          ? e.magicType !== "Divina"
          : ["clerigo", "druida"].includes(source)
            ? e.magicType !== "Arcana"
            : true)) &&
      (!["bardo", "druida"].includes(source) ||
        schools.includes(e.school ?? "")),
  );
}
export function validation(
  c: Character,
  creation = false,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [],
    warnings: string[] = [];
  const d = calculate({ ...c, hp: Math.max(1, c.hp) });
  const attrs = Object.fromEntries(
    ATTRIBUTES.map((a) => [a.id, d.attributes[a.id].total]),
  );
  const race = RACE_MAP.get(c.raceId)!;
  if (!c.name.trim()) errors.push("Informe o nome do personagem.");
  if (
    race.choose &&
    (new Set(c.racialChoices).size !== race.choose ||
      c.racialChoices.some((a) => a === race.exclude))
  )
    errors.push(
      `Escolha ${race.choose} atributos raciais diferentes${race.exclude ? `, exceto ${race.exclude.toUpperCase()}` : ""}.`,
    );
  if (c.raceId === "golem" && c.originId)
    errors.push("Golem não recebe origem.");
  if (
    c.levels.some((l) => l.classId === "druida") &&
    !["allihanna", "megalokk", "oceano"].some(
      (x) => slug(ENTRY_MAP.get(c.deityId)?.name ?? "") === x,
    )
  )
    errors.push("Druidas devem seguir Allihanna, Megalokk ou Oceano.");
  if (
    c.levels.some((l) => l.classId === "paladino") &&
    c.deityId &&
    ![
      "azgher",
      "khalmyr",
      "lena",
      "lin-wu",
      "marah",
      "tanna-toh",
      "thyatis",
      "valkaria",
    ].includes(slug(ENTRY_MAP.get(c.deityId)?.name ?? ""))
  )
    errors.push("Esta divindade não admite paladinos.");
  if (
    c.levels.some((l) => ["bardo", "druida"].includes(l.classId)) &&
    selected(c, "schools").length !== 3
  )
    errors.push("Escolha três escolas de magia.");
  if (
    c.levels.some((l) => l.classId === "arcanista") &&
    c.choices.path === "Feiticeiro" &&
    !c.choices.lineage
  )
    errors.push("Escolha a linhagem do feiticeiro.");
  for (const ac of c.acquisitions) {
    const e = ENTRY_MAP.get(ac.entryId);
    if (!e) {
      warnings.push("Há uma referência de catálogo não reconhecida.");
      continue;
    }
    for (const message of validatePrerequisites(c, e, attrs))
      errors.push(`${e.name}: ${message}`);
    if (e.name === "Familiar" && !ac.choices.familiar)
      errors.push("Escolha o animal do poder Familiar.");
    if (e.name === "Companheiro Animal" && !ac.choices.partnerType)
      errors.push("Escolha o tipo do companheiro animal.");
    if (
      ["Especialista em Escola", "Mestre em Escola"].includes(e.name) &&
      !ac.choices.school
    )
      errors.push(`Escolha a escola de ${e.name}.`);
  }
  if (creation) {
    const method = String(c.choices.attributeMethod ?? "points");
    const cost = Object.values(c.attributes).reduce(
      (n, a) => n + (POINT_COST[a] ?? 100),
      0,
    );
    if (method === "points" && cost !== 10)
      errors.push(`Distribua os 10 pontos de atributos (usados: ${cost}).`);
    if (method === "manual" && !String(c.choices.attributeReason ?? "").trim())
      errors.push(
        "Informe o motivo dos atributos ajustados e o mestre que autorizou.",
      );
    const mandatory = classTraining(c);
    if (selected(c, "classSkills").length !== mandatory.choices)
      errors.push(`Escolha ${mandatory.choices} perícias da classe.`);
    if (selected(c, "intSkills").length !== Math.max(0, attrs.int))
      errors.push(
        `Escolha ${Math.max(0, attrs.int)} perícias adicionais por Inteligência.`,
      );
    const chosen = ["classSkills", "intSkills", "raceSkills", "originSkills"]
      .flatMap((k) => selected(c, k))
      .concat(mandatory.mandatory)
      .map((id) => craftId(c, id));
    if (new Set(chosen).size !== chosen.length)
      errors.push(
        "Escolha treinamentos diferentes; uma perícia já treinada não pode ser selecionada novamente.",
      );
    const racePowers = c.acquisitions.filter(
      (a) => a.source === "Raça" && ENTRY_MAP.get(a.entryId)?.kind !== "spell",
    ).length;
    const racialCount =
      c.raceId === "humano"
        ? 2
        : c.raceId === "golem" || c.raceId === "kliren" || c.raceId === "osteon"
          ? 1
          : 0;
    if (
      racialCount &&
      selected(c, "raceSkills").length + racePowers !== racialCount
    )
      errors.push(`Complete ${racialCount} benefício(s) de ${race.name}.`);
    if (c.raceId === "humano" && racePowers > 1)
      errors.push(
        "Versátil permite trocar apenas um treinamento por um poder geral.",
      );
    if (
      c.originId &&
      c.raceId !== "golem" &&
      selected(c, "originSkills").length +
        c.acquisitions.filter((a) => a.source === "Origem").length !==
        2 &&
      !slug(ENTRY_MAP.get(c.originId)?.name ?? "").includes("amnesico")
    )
      errors.push("Escolha dois benefícios da origem.");
  }
  for (const cls of CLASSES) {
    const count = knownSpellCount(c, cls.id);
    if (!count) continue;
    const spells = c.acquisitions.filter(
      (a) =>
        a.source === cls.id &&
        ENTRY_MAP.get(a.entryId)?.kind === "spell" &&
        a.mode !== "device" &&
        a.mode !== "formula",
    );
    if (spells.length < count)
      errors.push(
        `${cls.name}: escolha ${count - spells.length} magia(s) conhecida(s).`,
      );
    if (
      spells.length > count &&
      !(cls.id === "arcanista" && c.choices.path === "Mago")
    )
      errors.push(`${cls.name}: número de magias conhecidas excedido.`);
    if (["bardo", "druida"].includes(cls.id)) {
      const extra =
        c.acquisitions.filter(
          (a) =>
            a.source === cls.id &&
            ["Aumentar Repertório", "Segredos da Natureza"].includes(
              ENTRY_MAP.get(a.entryId)?.name ?? "",
            ),
        ).length * 2;
      if (
        spells.filter(
          (a) =>
            ENTRY_MAP.get(a.entryId)?.magicType ===
            (cls.id === "bardo" ? "Divina" : "Arcana"),
        ).length > extra
      )
        errors.push(
          `${cls.name}: magias do outro tipo excedem as escolhas concedidas pelo poder.`,
        );
    }
    for (const ac of spells)
      if (!spellOptions(c, cls.id).some((e) => e.id === ac.entryId))
        errors.push(
          `${ENTRY_MAP.get(ac.entryId)?.name}: tipo, escola ou círculo indisponível para ${cls.name}.`,
        );
    if (
      cls.id === "arcanista" &&
      c.choices.path === "Mago" &&
      spells.filter((a) => a.prepared).length > Math.floor(spells.length / 2)
    )
      errors.push(
        "Mago memoriza metade das magias conhecidas, arredondada para baixo.",
      );
  }
  const racial = racialMagic(c),
    racialChoices = c.acquisitions.filter(
      (a) => a.source === "Raça" && ENTRY_MAP.get(a.entryId)?.kind === "spell",
    );
  if (racialChoices.length !== racial.count)
    errors.push(`Escolha ${racial.count} magia(s) racial(is).`);
  if (
    racialChoices.some(
      (a) => !racial.options.includes(ENTRY_MAP.get(a.entryId)?.name ?? ""),
    )
  )
    errors.push("A magia escolhida não está entre as opções da raça.");
  if (c.deityId) {
    const count = c.levels.some((l) =>
      ["clerigo", "druida", "paladino"].includes(l.classId),
    )
      ? 2
      : 1;
    const powers = c.acquisitions.filter((a) => a.source === "Devoção");
    if (powers.length !== count)
      errors.push(`Escolha ${count} poder(es) concedido(s) da devoção.`);
    const options = powerOptions(c, "Devoção");
    if (powers.some((a) => !options.some((e) => e.id === a.entryId)))
      errors.push("Poder concedido não pertence à divindade escolhida.");
  }
  for (const t of c.trained)
    if (!SKILLS.some((s) => s.id === t.id) && !t.id.startsWith("oficio-"))
      warnings.push(`Treinamento desconhecido: ${t.id}.`);
  const duplicates = new Map<string, number>();
  for (const ac of c.acquisitions) {
    const n = (duplicates.get(ac.entryId) ?? 0) + 1;
    duplicates.set(ac.entryId, n);
    const e = ENTRY_MAP.get(ac.entryId);
    if (
      n > 1 &&
      e &&
      !/pode escolher este poder|várias vezes|novamente|uma vez por patamar/i.test(
        e.description,
      ) &&
      e.name !== "Aumento de Atributo" &&
      e.kind !== "spell"
    )
      errors.push(`${e.name} foi adquirido mais de uma vez.`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
export function allowAdjustment(c: Character, errors: string[]): Character {
  const next = structuredClone(c);
  next.choices.reviewedExceptions = errors;
  return next;
}
export function learn(
  c: Character,
  entryId: string,
  source: string,
): Character {
  const next = structuredClone(c);
  const a = acquisition(entryId, c.levels.length, source);
  if (ENTRY_MAP.get(entryId)?.kind === "spell") {
    a.mode = "spell";
    a.prepared = !(source === "arcanista" && c.choices.path === "Mago");
  }
  next.acquisitions.push(a);
  return next;
}
