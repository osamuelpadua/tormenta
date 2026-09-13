import { z } from "zod";
import { normalizeAmmunition } from "../domain/character";
import { CLASS_MAP, ENTRY_MAP, RACE_MAP, RULESET } from "../data/rules";
import type { Character, HistoryEvent } from "../domain/types";
const num = z.number().finite().min(-1000000).max(1000000);
const count = z.number().int().min(0).max(1000000);
const text = z.string().max(50000);
const id = z.string().min(1).max(200);
const attribute = z.enum(["for", "des", "con", "int", "sab", "car"]);
const attrs = z.strictObject({
  for: num,
  des: num,
  con: num,
  int: num,
  sab: num,
  car: num,
});
const damage = z.enum([
  "ácido",
  "corte",
  "eletricidade",
  "essência",
  "fogo",
  "frio",
  "impacto",
  "luz",
  "perfuração",
  "psíquico",
  "trevas",
]);
const source = z.enum([
  "habilidade",
  "pericia",
  "item",
  "magia",
  "parceiro",
  "ambiente",
  "condicao",
  "ajuste",
]);
const modifier = z.strictObject({
  id,
  label: text,
  target: id,
  value: num,
  source,
  sourceId: id,
  operation: z.enum(["add", "set", "multiply"]).optional(),
  condition: text.optional(),
  page: count.optional(),
  stack: z.boolean().optional(),
});
const duration = z.strictObject({
  unit: z.enum([
    "instant",
    "scene",
    "round",
    "minute",
    "hour",
    "day",
    "sustained",
    "permanent",
    "discharge",
  ]),
  value: num,
  remaining: num,
  anchor: num,
  end: z.enum(["before", "after"]),
});
const effect = z.strictObject({
  id,
  name: text,
  entryId: id.optional(),
  source,
  description: text,
  modifiers: z.array(modifier).max(100),
  duration,
  active: z.boolean(),
  startedRound: count,
  startedTurn: count,
  maintenance: count,
  condition: text.optional(),
  target: text.optional(),
});
const item = z
  .object({
    id,
    templateId: id.optional(),
    entryId: id.optional(),
    name: text,
    category: text,
    quantity: count,
    spaces: z.number().finite().min(0).max(1000000),
    price: z.number().finite().min(0).max(100000000),
    state: z.enum(["stored", "carried", "worn", "wielded"]),
    benefit: z.boolean(),
    hands: z.number().int().min(0).max(2),
    defense: num,
    penalty: num,
    heavy: z.boolean(),
    proficiency: text,
    damage: text,
    damageType: damage,
    threat: z.number().int().min(1).max(20),
    critical: z.number().int().min(1).max(10),
    range: text,
    attackType: z.enum(["melee", "ranged", "thrown"]),
    notes: text,
    modifiers: z.array(modifier).max(100),
    improvements: z.array(text).max(100),
    enchantments: z.array(text).max(100),
    charges: count.optional(),
    hp: num.optional(),
    page: count.optional(),
  })
  .strict();
export const characterSchema = z
  .strictObject({
    id,
    revision: count,
    name: z.string().min(1).max(200),
    player: text,
    raceId: id.refine((x) => RACE_MAP.has(x), "Raça desconhecida"),
    originId: text,
    deityId: text,
    concept: text,
    appearance: text,
    personality: text,
    biography: text,
    notes: text,
    age: count,
    alignment: text,
    portrait: text,
    attributes: attrs,
    racialChoices: z.array(attribute).max(6),
    levels: z
      .array(
        z.strictObject({
          classId: id.refine((x) => CLASS_MAP.has(x), "Classe desconhecida"),
          powers: z.array(id).max(100),
          notes: text,
        }),
      )
      .min(1)
      .max(20),
    choices: z.record(
      z.string().max(200),
      z.union([text, z.array(text).max(100)]),
    ),
    trained: z
      .array(z.strictObject({ id, source: text, level: count }))
      .max(200),
    crafts: z.array(text).max(100),
    acquisitions: z
      .array(
        z.strictObject({
          id,
          entryId: id,
          level: count,
          source: text,
          choices: z.record(z.string(), text),
          favorite: z.boolean(),
          prepared: z.boolean().optional(),
          mode: z.enum(["spell", "formula", "device"]).optional(),
          uses: count.optional(),
          broken: z.boolean().optional(),
        }),
      )
      .max(2000),
    inventory: z.array(item).max(2000),
    attacks: z
      .array(
        z.strictObject({
          id,
          name: text,
          itemId: id.optional(),
          skill: id,
          damage: text,
          damageType: damage,
          threat: z.number().int().min(1).max(20),
          critical: z.number().int().min(1).max(10),
          range: text,
          attribute: attribute.nullable(),
          attackBonus: num,
          damageBonus: num,
          natural: z.boolean(),
          favorite: z.boolean(),
        }),
      )
      .max(200),
    modifiers: z.array(modifier).max(1000),
    effects: z.array(effect).max(1000),
    hp: num,
    mp: count,
    nonlethal: count,
    temporary: z
      .array(
        z.strictObject({
          id,
          source: text,
          kind: z.enum(["hp", "mp"]),
          value: count,
          duration: z.enum(["scene", "day", "effect"]),
          effectId: id.optional(),
        }),
      )
      .max(1000),
    sacrifice: count,
    coins: z.strictObject({ tc: count, ts: count, to: count }),
    xp: count,
    advancement: z.enum(["xp", "milestones"]),
    combat: z.strictObject({
      active: z.boolean(),
      round: count,
      turn: count,
      phase: z.enum(["before", "turn", "after"]),
      initiative: num,
      cursor: num,
      standard: count,
      movement: count,
      freeSpellUsed: z.boolean(),
      used: z.array(text).max(500),
      attacked: z.boolean(),
      hostile: z.boolean(),
      elapsedMinutes: z.number().finite().min(0),
      scene: count,
      day: count,
      pending: z.array(text).max(100),
    }),
    favorites: z.array(text).max(2000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((c, ctx) => {
    for (const key of [
      "inventory",
      "attacks",
      "acquisitions",
      "effects",
      "temporary",
      "modifiers",
    ] as const) {
      const ids = c[key].map((x) => x.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Identificadores duplicados.",
        });
    }
  });
const rollSchema = z.strictObject({
  expression: text,
  total: num,
  dice: z
    .array(
      z.strictObject({
        sides: count,
        values: z.array(count).max(100),
        kept: z.array(count).max(100),
      }),
    )
    .max(100),
  constant: num,
  natural: num.optional(),
});
export const eventSchema = z.strictObject({
  id,
  characterId: id,
  at: z.iso.datetime(),
  title: text,
  detail: text,
  kind: text,
  round: count,
  before: characterSchema.optional(),
  undone: z.boolean().optional(),
  rolls: z.array(rollSchema).max(100).optional(),
});
export const BACKUP_SCHEMA = 1;
const backupSchema = z.strictObject({
  format: z.literal("tormenta-personagens"),
  schema: z.literal(BACKUP_SCHEMA),
  catalog: text,
  exportedAt: z.iso.datetime(),
  characters: z.array(characterSchema).min(1).max(100),
  history: z.array(eventSchema).max(20000),
});
export interface Backup {
  format: "tormenta-personagens";
  schema: 1;
  catalog: string;
  exportedAt: string;
  characters: Character[];
  history: HistoryEvent[];
}
export function parseBackup(raw: string): {
  backup: Backup;
  warnings: string[];
} {
  if (raw.length > 50 * 1024 * 1024)
    throw new Error("O backup excede o limite de 50 MB.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Arquivo JSON inválido.");
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success)
    throw new Error(
      `Backup incompatível: ${parsed.error.issues
        .slice(0, 3)
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(" · ")}`,
    );
  const backup = parsed.data as Backup;
  const rootIds = new Set(backup.characters.map((c) => c.id));
  if (rootIds.size !== backup.characters.length)
    throw new Error("O backup contém personagens com o mesmo identificador.");
  if (
    backup.history.some(
      (e) =>
        !rootIds.has(e.characterId) ||
        (e.before && e.before.id !== e.characterId),
    )
  )
    throw new Error("O histórico referencia um personagem incompatível.");
  if (new Set(backup.history.map((e) => e.id)).size !== backup.history.length)
    throw new Error("O backup contém eventos duplicados.");
  const warnings: string[] = [];
  let ammunitionChanged = false;
  for (const c of [
    ...backup.characters,
    ...backup.history.flatMap((e) => (e.before ? [e.before] : [])),
  ])
    for (const item of c.inventory)
      ammunitionChanged = normalizeAmmunition(item) || ammunitionChanged;
  if (ammunitionChanged)
    warnings.push(
      "Munições de versões anteriores serão convertidas de pacotes para unidades, preservando quantidade, preço total e carga.",
    );
  if (backup.catalog !== RULESET)
    warnings.push(
      "A versão do catálogo é diferente; confira as referências após importar.",
    );
  for (const c of backup.characters) {
    const unknown = c.acquisitions.filter((a) => !ENTRY_MAP.has(a.entryId));
    if (unknown.length)
      warnings.push(
        `${c.name}: ${unknown.length} referência(s) de catálogo não encontrada(s); os dados serão preservados.`,
      );
  }
  return { backup, warnings };
}
