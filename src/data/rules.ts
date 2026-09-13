import sourceClasses from "./class-source.json" with { type: "json" };
import rawCatalog from "./catalog.json" with { type: "json" };
import type {
  Attribute,
  Attributes,
  CatalogEntry,
  Character,
  Item,
} from "../domain/types";
export const RULESET = "t20-jda-2023-11-17";
export function racialMagic(c: Character): {
  fixed: string[];
  options: string[];
  count: number;
  attribute: Attribute;
} {
  const result: {
    fixed: string[];
    options: string[];
    count: number;
    attribute: Attribute;
  } = { fixed: [], options: [], count: 0, attribute: "car" };
  if (c.raceId === "dahllan") {
    result.fixed = ["Controlar Plantas"];
    result.attribute = "sab";
  }
  if (c.raceId === "suraggel") {
    result.fixed = [c.choices.suraggel === "Sulfure" ? "Escuridão" : "Luz"];
    result.attribute = c.choices.suraggel === "Sulfure" ? "int" : "car";
  }
  if (c.raceId === "qareen") {
    result.count = 1;
    result.options = CATALOG.filter(
      (e) => e.kind === "spell" && e.circle === 1,
    ).map((e) => e.name);
  }
  if (c.raceId === "silfide") {
    result.count = 2;
    result.options = ["Criar Ilusão", "Enfeitiçar", "Luz", "Sono"];
  }
  if (c.raceId === "sereia-tritao") {
    result.count = 2;
    result.options = [
      "Amedrontar",
      "Comando",
      "Despedaçar",
      "Enfeitiçar",
      "Hipnotismo",
      "Sono",
    ];
  }
  return result;
}
export const ATTRIBUTES: {
  id: Attribute;
  name: string;
  description: string;
}[] = [
  {
    id: "for",
    name: "Força",
    description: "Potência muscular e capacidade atlética",
  },
  {
    id: "des",
    name: "Destreza",
    description: "Agilidade, reflexos e coordenação",
  },
  {
    id: "con",
    name: "Constituição",
    description: "Saúde, vigor e resistência física",
  },
  {
    id: "int",
    name: "Inteligência",
    description: "Raciocínio, memória e educação",
  },
  {
    id: "sab",
    name: "Sabedoria",
    description: "Percepção, determinação e ponderação",
  },
  {
    id: "car",
    name: "Carisma",
    description: "Personalidade, presença e persuasão",
  },
];
export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
export const CATALOG = rawCatalog as CatalogEntry[];
export const ENTRY_MAP = new Map(CATALOG.map((e) => [e.id, e]));
export const entryNamed = (name: string, group?: string) =>
  CATALOG.find(
    (e) =>
      slug(e.name) === slug(name) && (!group || slug(e.group) === slug(group)),
  );
export const SKILLS = [
  ["Acrobacia", "des", false, true],
  ["Adestramento", "car", true, false],
  ["Atletismo", "for", false, false],
  ["Atuação", "car", true, false],
  ["Cavalgar", "des", false, false],
  ["Conhecimento", "int", true, false],
  ["Cura", "sab", false, false],
  ["Diplomacia", "car", false, false],
  ["Enganação", "car", false, false],
  ["Fortitude", "con", false, false],
  ["Furtividade", "des", false, true],
  ["Guerra", "int", true, false],
  ["Iniciativa", "des", false, false],
  ["Intimidação", "car", false, false],
  ["Intuição", "sab", false, false],
  ["Investigação", "int", false, false],
  ["Jogatina", "car", true, false],
  ["Ladinagem", "des", true, true],
  ["Luta", "for", false, false],
  ["Misticismo", "int", true, false],
  ["Nobreza", "int", true, false],
  ["Ofício", "int", true, false],
  ["Percepção", "sab", false, false],
  ["Pilotagem", "des", true, false],
  ["Pontaria", "des", false, false],
  ["Reflexos", "des", false, false],
  ["Religião", "sab", true, false],
  ["Sobrevivência", "sab", false, false],
  ["Vontade", "sab", false, false],
].map(([name, attribute, trained, armor]) => ({
  id: slug(name as string),
  name: name as string,
  attribute: attribute as Attribute,
  trained: trained as boolean,
  armor: armor as boolean,
}));
export const CLASSES = sourceClasses.map((c) => {
  const parts = c.skills.split(/mais\s*\d+\s*a sua escolha entre/i);
  const choices = Number(c.skills.match(/mais\s*(\d+)/)?.[1] ?? 0);
  const names = (s: string) =>
    [
      ...s.matchAll(/([\p{L}çãéíóúôâ ]+)\s*\((?:Int|For|Des|Car|Sab|Con)\)/gu),
    ].map((m) => slug(m[1].trim().replace(/^(?:e|ou)\s+/i, "")));
  return {
    ...c,
    choices,
    mandatory: names(parts[0] ?? ""),
    either: /\bou\b/.test(parts[0] ?? ""),
    options: names(parts[1] ?? ""),
    proficiencyIds: [
      "simples",
      "leves",
      ...(/marciais/.test(c.proficiencies) ? ["marciais"] : []),
      ...(/pesadas/.test(c.proficiencies) ? ["pesadas"] : []),
      ...(/escudos/.test(c.proficiencies) ? ["escudos"] : []),
    ],
  };
});
export const CLASS_MAP = new Map(CLASSES.map((c) => [c.id, c]));
export interface Race {
  id: string;
  name: string;
  page: number;
  attributes: Partial<Attributes>;
  choose: number;
  exclude?: Attribute;
  speed: number;
  size: string;
  type: string;
  senses: string[];
  abilities: string[];
}
const raceRows: [
  string,
  number,
  Partial<Attributes>,
  number,
  Attribute | undefined,
  number,
  string,
  string,
  string[],
  string[],
][] = [
  ["Humano", 19, {}, 3, undefined, 9, "Médio", "humanoide", [], ["Versátil"]],
  [
    "Anão",
    20,
    { con: 2, sab: 1, des: -1 },
    0,
    undefined,
    6,
    "Médio",
    "humanoide",
    ["Visão no escuro"],
    [
      "Conhecimento das Rochas",
      "Devagar e Sempre",
      "Duro como Pedra",
      "Tradição de Heredrimm",
    ],
  ],
  [
    "Dahllan",
    21,
    { sab: 2, des: 1, int: -1 },
    0,
    undefined,
    9,
    "Médio",
    "humanoide",
    [],
    ["Amiga das Plantas", "Armadura de Allihanna", "Empatia Selvagem"],
  ],
  [
    "Elfo",
    22,
    { int: 2, des: 1, con: -1 },
    0,
    undefined,
    12,
    "Médio",
    "humanoide",
    ["Visão na penumbra"],
    ["Graça de Glórienn", "Sangue Mágico", "Sentidos Élficos"],
  ],
  [
    "Goblin",
    23,
    { des: 2, int: 1, car: -1 },
    0,
    undefined,
    9,
    "Pequeno",
    "humanoide",
    ["Visão no escuro", "Escalada"],
    ["Engenhoso", "Espelunqueiro", "Peste Esguia", "Rato das Ruas"],
  ],
  [
    "Lefou",
    24,
    { car: -1 },
    3,
    "car",
    9,
    "Médio",
    "monstro",
    [],
    ["Cria da Tormenta", "Deformidade"],
  ],
  [
    "Minotauro",
    25,
    { for: 2, con: 1, sab: -1 },
    0,
    undefined,
    9,
    "Médio",
    "humanoide",
    ["Faro"],
    ["Chifres", "Couro Rígido", "Faro", "Medo de Altura"],
  ],
  [
    "Qareen",
    26,
    { car: 2, int: 1, sab: -1 },
    0,
    undefined,
    9,
    "Médio",
    "humanoide",
    [],
    ["Desejos", "Resistência Elemental", "Tatuagem Mística"],
  ],
  [
    "Golem",
    27,
    { for: 2, con: 1, car: -1 },
    0,
    undefined,
    6,
    "Médio",
    "construto",
    ["Visão no escuro"],
    [
      "Chassi",
      "Criatura Artificial",
      "Fonte Elemental",
      "Propósito de Criação",
    ],
  ],
  [
    "Hynne",
    27,
    { des: 2, car: 1, for: -1 },
    0,
    undefined,
    6,
    "Pequeno",
    "humanoide",
    [],
    ["Arremessador", "Pequeno e Rechonchudo", "Sorte Salvadora"],
  ],
  [
    "Kliren",
    28,
    { int: 2, car: 1, for: -1 },
    0,
    undefined,
    9,
    "Médio",
    "humanoide",
    [],
    ["Híbrido", "Engenhosidade", "Ossos Frágeis", "Vanguardista"],
  ],
  [
    "Medusa",
    28,
    { des: 2, car: 1 },
    0,
    undefined,
    9,
    "Médio",
    "monstro",
    ["Visão no escuro"],
    ["Cria de Megalokk", "Natureza Venenosa", "Olhar Atordoante"],
  ],
  [
    "Osteon",
    29,
    { con: -1 },
    3,
    "con",
    9,
    "Médio",
    "morto-vivo",
    ["Visão no escuro"],
    [
      "Armadura Óssea",
      "Memória Póstuma",
      "Natureza Esquelética",
      "Preço da Não Vida",
    ],
  ],
  [
    "Sereia/tritão",
    29,
    {},
    3,
    undefined,
    9,
    "Médio",
    "humanoide",
    ["Natação 12m"],
    ["Canção dos Mares", "Mestre do Tridente", "Transformação Anfíbia"],
  ],
  [
    "Sílfide",
    30,
    { car: 2, des: 1, for: -2 },
    0,
    undefined,
    9,
    "Minúsculo",
    "espírito",
    ["Visão na penumbra", "Pairar 1,5m"],
    ["Asas de Borboleta", "Espírito da Natureza", "Magia das Fadas"],
  ],
  [
    "Suraggel",
    30,
    { sab: 2, car: 1 },
    0,
    undefined,
    9,
    "Médio",
    "espírito",
    ["Visão no escuro"],
    ["Herança Divina", "Luz Sagrada (Aggelus)"],
  ],
  [
    "Trog",
    31,
    { con: 2, for: 1, int: -1 },
    0,
    undefined,
    9,
    "Médio",
    "monstro",
    ["Visão no escuro"],
    ["Mau Cheiro", "Mordida", "Reptiliano", "Sangue Frio"],
  ],
];
export const RACES: Race[] = raceRows.map(
  ([
    name,
    page,
    attributes,
    choose,
    exclude,
    speed,
    size,
    type,
    senses,
    abilities,
  ]) => ({
    id: slug(name),
    name,
    page,
    attributes,
    choose,
    exclude,
    speed,
    size,
    type,
    senses,
    abilities,
  }),
);
export const RACE_MAP = new Map(RACES.map((r) => [r.id, r]));
export const SCHOOLS = [
  "Abjuração",
  "Adivinhação",
  "Convocação",
  "Encantamento",
  "Evocação",
  "Ilusão",
  "Necromancia",
  "Transmutação",
];
export const DAMAGE_TYPES = [
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
] as const;
export const CONDITIONS = CATALOG.filter((e) => e.kind === "condition");
export const TRAINING_BONUS = (level: number) =>
  level >= 15 ? 6 : level >= 7 ? 4 : 2;
export const XP = [
  0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000, 55000, 66000,
  78000, 91000, 105000, 120000, 136000, 153000, 171000, 190000,
];
export const WEALTH = [
  0, 300, 600, 1000, 2000, 3000, 5000, 7000, 10000, 13000, 19000, 27000, 36000,
  49000, 66000, 88000, 110000, 150000, 200000, 260000,
];
export const POINT_COST: Record<number, number> = {
  [-1]: -1,
  0: 0,
  1: 1,
  2: 2,
  3: 4,
  4: 7,
};
export const ACTION_LABELS = {
  padrao: "Padrão",
  movimento: "Movimento",
  completa: "Completa",
  livre: "Livre",
  reacao: "Reação",
};
export const classLevel = (c: Character, id: string) =>
  c.levels.filter((l) => l.classId === id).length;
export const magicAttribute = (c: Character, classId: string): Attribute =>
  classId === "arcanista"
    ? c.choices.path === "Feiticeiro"
      ? "car"
      : "int"
    : classId === "bardo"
      ? "car"
      : "sab";
export const maxCircle = (c: Character, classId: string) => {
  const n = classLevel(c, classId);
  return !n
    ? 0
    : ["arcanista", "clerigo"].includes(classId)
      ? Math.min(5, Math.floor((n - 1) / 4) + 1)
      : ["bardo", "druida"].includes(classId)
        ? n < 6
          ? 1
          : n < 10
            ? 2
            : n < 14
              ? 3
              : 4
        : 0;
};
export const knownSpellCount = (c: Character, classId: string) => {
  const n = classLevel(c, classId);
  if (!n) return 0;
  const extra =
    c.acquisitions.filter(
      (a) =>
        a.source === classId &&
        [
          "Conhecimento Mágico",
          "Aumentar Repertório",
          "Segredos da Natureza",
        ].includes(ENTRY_MAP.get(a.entryId)?.name ?? ""),
    ).length * 2;
  if (classId === "arcanista")
    return (
      extra +
      (c.choices.path === "Feiticeiro"
        ? 3 + Math.floor((n - 1) / 2)
        : n + 2 + (c.choices.path === "Mago" ? maxCircle(c, classId) : 0))
    );
  return (
    extra +
    (classId === "clerigo"
      ? n + 2
      : ["bardo", "druida"].includes(classId)
        ? 2 + Math.floor(n / 2)
        : 0)
  );
};
export const newItem = (name = "Novo item"): Item => ({
  id: crypto.randomUUID(),
  name,
  category: "Equipamento de aventura",
  quantity: 1,
  spaces: 1,
  price: 0,
  state: "carried",
  benefit: true,
  hands: 0,
  defense: 0,
  penalty: 0,
  heavy: false,
  proficiency: "",
  damage: "",
  damageType: "impacto",
  threat: 20,
  critical: 2,
  range: "Corpo a corpo",
  attackType: "melee",
  notes: "",
  modifiers: [],
  improvements: [],
  enchantments: [],
});
