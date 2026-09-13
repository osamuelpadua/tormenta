export type Attribute = "for" | "des" | "con" | "int" | "sab" | "car";
export type Attributes = Record<Attribute, number>;
export type SourceKind =
  | "habilidade"
  | "pericia"
  | "item"
  | "magia"
  | "parceiro"
  | "ambiente"
  | "condicao"
  | "ajuste";
export type ActionType =
  "padrao" | "movimento" | "completa" | "livre" | "reacao";
export type DamageType =
  | "ácido"
  | "corte"
  | "eletricidade"
  | "essência"
  | "fogo"
  | "frio"
  | "impacto"
  | "luz"
  | "perfuração"
  | "psíquico"
  | "trevas";
export interface SourceRef {
  page: number;
  label?: string;
}
export interface Modifier {
  id: string;
  label: string;
  target: string;
  value: number;
  source: SourceKind;
  sourceId: string;
  operation?: "add" | "set" | "multiply";
  condition?: string;
  page?: number;
  stack?: boolean;
}
export interface Component {
  label: string;
  value: number;
  applied: boolean;
  reason?: string;
  page?: number;
}
export interface DerivedValue {
  total: number;
  components: Component[];
}
export interface Enhancement {
  id: string;
  cost: number;
  trick: boolean;
  text: string;
  repeatable: boolean;
  requiresCircle: number;
}
export interface CatalogEntry {
  sourceVersion?: string;
  reviewStatus?: "extracted" | "reviewed";
  id: string;
  name: string;
  kind: string;
  group: string;
  page: number;
  pdfPage: number;
  endPage: number;
  description: string;
  prerequisites?: string;
  magicType?: string;
  circle?: number;
  school?: string;
  cost?: number;
  execution?: string;
  range?: string;
  duration?: string;
  resistance?: string;
  target?: string;
  area?: string;
  effect?: string;
  enhancements?: Enhancement[];
}
export interface Acquisition {
  id: string;
  entryId: string;
  level: number;
  source: string;
  choices: Record<string, string>;
  favorite: boolean;
  prepared?: boolean;
  mode?: "spell" | "formula" | "device";
  uses?: number;
  broken?: boolean;
}
export interface LevelChoice {
  classId: string;
  powers: string[];
  notes: string;
}
export interface SkillTraining {
  id: string;
  source: string;
  level: number;
}
export interface Item {
  id: string;
  templateId?: string;
  entryId?: string;
  name: string;
  category: string;
  quantity: number;
  spaces: number;
  price: number;
  state: "stored" | "carried" | "worn" | "wielded";
  benefit: boolean;
  hands: number;
  defense: number;
  penalty: number;
  heavy: boolean;
  proficiency: string;
  damage: string;
  damageType: DamageType;
  threat: number;
  critical: number;
  range: string;
  attackType: "melee" | "ranged" | "thrown";
  notes: string;
  modifiers: Modifier[];
  improvements: string[];
  enchantments: string[];
  charges?: number;
  hp?: number;
}
export interface Attack {
  id: string;
  name: string;
  itemId?: string;
  skill: string;
  damage: string;
  damageType: DamageType;
  threat: number;
  critical: number;
  range: string;
  attribute: Attribute | null;
  attackBonus: number;
  damageBonus: number;
  natural: boolean;
  favorite: boolean;
}
export type Duration = {
  unit:
    | "instant"
    | "scene"
    | "round"
    | "minute"
    | "hour"
    | "day"
    | "sustained"
    | "permanent"
    | "discharge";
  value: number;
  remaining: number;
  anchor: number;
  end: "before" | "after";
};
export interface Effect {
  id: string;
  name: string;
  entryId?: string;
  source: SourceKind;
  description: string;
  modifiers: Modifier[];
  duration: Duration;
  active: boolean;
  startedRound: number;
  startedTurn: number;
  maintenance: number;
  condition?: string;
  target?: string;
}
export interface TemporaryPool {
  id: string;
  source: string;
  kind: "hp" | "mp";
  value: number;
  duration: "scene" | "day" | "effect";
  effectId?: string;
}
export interface CombatState {
  active: boolean;
  round: number;
  turn: number;
  phase: "before" | "turn" | "after";
  initiative: number;
  cursor: number;
  standard: number;
  movement: number;
  freeSpellUsed: boolean;
  used: string[];
  attacked: boolean;
  hostile: boolean;
  elapsedMinutes: number;
  scene: number;
  day: number;
  pending: string[];
}
export interface Character {
  id: string;
  revision: number;
  name: string;
  player: string;
  raceId: string;
  originId: string;
  deityId: string;
  concept: string;
  appearance: string;
  personality: string;
  biography: string;
  notes: string;
  age: number;
  alignment: string;
  portrait: string;
  attributes: Attributes;
  racialChoices: Attribute[];
  levels: LevelChoice[];
  choices: Record<string, string | string[]>;
  trained: SkillTraining[];
  crafts: string[];
  acquisitions: Acquisition[];
  inventory: Item[];
  attacks: Attack[];
  modifiers: Modifier[];
  effects: Effect[];
  hp: number;
  mp: number;
  nonlethal: number;
  temporary: TemporaryPool[];
  sacrifice: number;
  coins: { tc: number; ts: number; to: number };
  xp: number;
  advancement: "xp" | "milestones";
  combat: CombatState;
  favorites: string[];
  createdAt: string;
  updatedAt: string;
}
export interface HistoryEvent {
  id: string;
  characterId: string;
  at: string;
  title: string;
  detail: string;
  kind: string;
  round: number;
  before?: Character;
  undone?: boolean;
  rolls?: RollResult[];
}
export interface RollResult {
  expression: string;
  total: number;
  dice: { sides: number; values: number[]; kept: number[] }[];
  constant: number;
  natural?: number;
}
export interface RulesContext {
  jumping?: boolean;
  melee?: boolean;
  underwater?: boolean;
  subterranean?: boolean;
  naturalTerrain?: boolean;
  attracted?: boolean;
  target?: string;
  targetConditions?: string[];
  effectTypes?: string[];
  terrain?: string;
  tools?: boolean;
  mounted?: boolean;
}
export interface DerivedCharacter {
  level: number;
  attributes: Record<Attribute, DerivedValue>;
  skills: Record<string, DerivedValue>;
  hp: DerivedValue;
  mp: DerivedValue;
  defense: DerivedValue;
  speed: DerivedValue;
  load: DerivedValue;
  capacity: DerivedValue;
  rd: DerivedValue;
  size: string;
  senses: string[];
  proficiencies: string[];
  conditions: string[];
  warnings: string[];
  attacks: (Attack & { toHit: DerivedValue; damageExpression: string })[];
}
