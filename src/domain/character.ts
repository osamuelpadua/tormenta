import {
  CATALOG,
  CLASS_MAP,
  CLASSES,
  ENTRY_MAP,
  RACE_MAP,
  SKILLS,
  classLevel,
  entryNamed,
  maxCircle,
  slug,
  racialMagic,
} from "../data/rules";
import templates from "../data/equipment.json" with { type: "json" };
import type { Acquisition, Character, Item, CatalogEntry } from "./types";
export const uid = () => crypto.randomUUID();
export const timestamp = () => new Date().toISOString();
export const ITEM_TEMPLATES = templates as unknown as (Item & {
  page: number;
})[];
export function normalizeAmmunition(item: Item): boolean {
  const pack =
    item.category === "Munição"
      ? Number(item.name.match(/\((\d+)\)/)?.[1] ?? 0)
      : 0;
  if (!pack) return false;
  item.quantity *= pack;
  item.price /= pack;
  item.spaces /= pack;
  item.hands = 0;
  item.damage = "";
  item.name = item.name.replace(/\s*\(\d+\)/, "");
  return true;
}
export function itemFromTemplate(id: string): Item {
  const t = ITEM_TEMPLATES.find((i) => i.id === id);
  if (!t) throw new Error("Item não encontrado.");
  const item = { ...structuredClone(t), id: uid(), templateId: id };
  normalizeAmmunition(item);
  return item;
}
export function emptyCharacter(): Character {
  return {
    id: uid(),
    revision: 0,
    name: "",
    player: "",
    raceId: "humano",
    originId: "",
    deityId: "",
    concept: "",
    appearance: "",
    personality: "",
    biography: "",
    notes: "",
    age: 20,
    alignment: "",
    portrait: "",
    attributes: { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 },
    racialChoices: ["for", "con", "sab"],
    levels: [{ classId: "guerreiro", powers: [], notes: "" }],
    choices: { path: "Bruxo", element: "fogo", suraggel: "Aggelus" },
    trained: [],
    crafts: [],
    acquisitions: [],
    inventory: [],
    attacks: [],
    modifiers: [],
    effects: [],
    hp: 0,
    mp: 0,
    nonlethal: 0,
    temporary: [],
    sacrifice: 0,
    coins: { tc: 0, ts: 0, to: 0 },
    xp: 0,
    advancement: "milestones",
    combat: {
      active: false,
      round: 1,
      turn: 0,
      phase: "before",
      initiative: 0,
      cursor: 0,
      standard: 1,
      movement: 1,
      freeSpellUsed: false,
      used: [],
      attacked: false,
      hostile: false,
      elapsedMinutes: 0,
      scene: 1,
      day: 1,
      pending: [],
    },
    favorites: [],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };
}
export function acquisition(
  entryId: string,
  level = 1,
  source = "Escolha",
): Acquisition {
  return {
    id: uid(),
    entryId,
    level,
    source,
    choices: {},
    favorite: false,
    prepared: true,
  };
}
export function automaticEntries(c: Character): CatalogEntry[] {
  const race = RACE_MAP.get(c.raceId);
  const found: CatalogEntry[] = [];
  for (const name of racialMagic(c).fixed) {
    const e = entryNamed(name);
    if (e) found.push(e);
  }
  for (const name of race?.abilities ?? []) {
    const entry = entryNamed(name);
    if (entry) found.push(entry);
  }
  if (c.raceId === "suraggel" && c.choices.suraggel === "Sulfure") {
    const i = found.findIndex((e) => e.name.includes("Luz Sagrada"));
    if (i >= 0) found.splice(i, 1);
    const e = entryNamed("Sombras Profanas (Sulfure)");
    if (e) found.push(e);
  }
  for (const cls of CLASSES) {
    const n = classLevel(c, cls.id);
    if (!n) continue;
    const progression = Object.entries(cls.progression)
      .filter(([l]) => Number(l) <= n)
      .map(([, v]) => v)
      .join(", ");
    for (const entry of CATALOG.filter(
      (e) => e.kind === "ability" && e.group === cls.name,
    ))
      if (slug(progression).includes(slug(entry.name))) found.push(entry);
  }
  return [...new Map(found.map((e) => [e.id, e])).values()];
}
export const characterEntries = (c: Character) => [
  ...automaticEntries(c),
  ...c.acquisitions
    .map((a) => ENTRY_MAP.get(a.entryId))
    .filter((e): e is CatalogEntry => !!e),
];
export const has = (c: Character, name: string) =>
  characterEntries(c).some((e) => slug(e.name) === slug(name));
export function originBenefits(id: string): {
  skills: string[];
  powers: CatalogEntry[];
  items: string;
} {
  const e = ENTRY_MAP.get(id);
  if (!e) return { skills: [], powers: [], items: "" };
  const full = e.description.replaceAll("\n", " ");
  const benefits = full.split("Benefícios.")[1] ?? full;
  // Itens/Benefícios headings are retained as plain text in the source entry.
  const sourceSkills = SKILLS.filter((s) =>
    new RegExp(s.name, "i").test(benefits),
  ).map((s) => s.id);
  const unique = CATALOG.find(
    (x) =>
      x.kind === "originPower" &&
      x.page >= e.page &&
      x.page <= e.endPage &&
      CATALOG.indexOf(x) === CATALOG.indexOf(e) + 1,
  );
  const powers = CATALOG.filter(
    (p) =>
      ["power", "originPower"].includes(p.kind) &&
      (benefits.includes(p.name) || p.id === unique?.id),
  );
  return {
    skills: sourceSkills,
    powers,
    items: full.match(/Itens\.\s*(.*?)(?=Benefícios\.|$)/)?.[1] ?? "",
  };
}
export function validatePrerequisites(
  c: Character,
  entry: CatalogEntry,
  attrs: Record<string, number>,
): string[] {
  const errors: string[] = [];
  const p = entry.prerequisites ?? "";
  for (const m of p.matchAll(/\b(For|Des|Con|Int|Sab|Car)\s+(\d+)/g))
    if ((attrs[m[1].toLowerCase()] ?? 0) < Number(m[2]))
      errors.push(`${m[1]} ${m[2]} necessário.`);
  for (const m of p.matchAll(/(\d+)[º°ª]\s*nível(?: de ([\p{L}]+))?/gu)) {
    const level = m[2] ? classLevel(c, slug(m[2])) : c.levels.length;
    if (level < Number(m[1])) errors.push(`${m[0]} necessário.`);
  }
  for (const skill of SKILLS)
    if (
      new RegExp(`treinado em[^.]*${skill.name}`, "i").test(p) &&
      !c.trained.some((t) => t.id === skill.id)
    )
      errors.push(`Treinamento em ${skill.name} necessário.`);
  const own = characterEntries(c);
  for (const other of CATALOG.filter(
    (e) =>
      ["power", "classPower"].includes(e.kind) &&
      e.name !== entry.name &&
      e.name.length > 5,
  ))
    if (
      p.includes(other.name) &&
      !own.some((e) => slug(e.name) === slug(other.name))
    )
      errors.push(`Requer ${other.name}.`);
  if (
    /Bruxo/.test(p) &&
    c.choices.path !== "Bruxo" &&
    !(/Mago/.test(p) && c.choices.path === "Mago")
  )
    errors.push("Requer o caminho indicado de arcanista.");
  if (/Feiticeiro/.test(p) && c.choices.path !== "Feiticeiro")
    errors.push("Requer Feiticeiro.");
  if (/capaz de lançar magias de (\d)/.test(p)) {
    const n = Number(p.match(/capaz de lançar magias de (\d)/)?.[1]);
    if (!CLASSES.some((cls) => maxCircle(c, cls.id) >= n))
      errors.push(`Requer magias de ${n}º círculo.`);
  }
  return [...new Set(errors)];
}
export function classTraining(c: Character): {
  mandatory: string[];
  choices: number;
  options: string[];
} {
  const cls = CLASS_MAP.get(c.levels[0].classId)!;
  return {
    mandatory: cls.either
      ? cls.mandatory
          .filter(
            (id) =>
              !["luta", "pontaria", "diplomacia", "intimidacao"].includes(id),
          )
          .concat(String(c.choices.primarySkill ?? cls.mandatory[0]))
      : cls.mandatory,
    choices: cls.choices,
    options: cls.options,
  };
}
export function cloneCharacter(c: Character): Character {
  const copy = structuredClone(c);
  copy.id = uid();
  copy.name = `${c.name} (cópia)`;
  copy.revision = 0;
  copy.createdAt = timestamp();
  copy.updatedAt = timestamp();
  return copy;
}
