import {
  ACTION_LABELS,
  CLASS_MAP,
  ENTRY_MAP,
  RACE_MAP,
  classLevel,
  magicAttribute,
  maxCircle,
  slug,
} from "../data/rules";
import { calculate, temporaryTotal, value } from "./calculate";
import { characterEntries, has, timestamp, uid } from "./character";
import { castingCost, createEffect, durationFor, usageFor } from "./effects";
import {
  criticalExpression,
  diceSides,
  physicalRoll,
  PhysicalRollRequired,
  roll,
  type PhysicalRoll,
} from "./dice";
import { magicPlan, type CastingContext } from "./magic";
import { attackPlan, type AttackOptions } from "./attacks";
import { formPlan } from "./forms";
import type {
  ActionType,
  Character,
  DamageType,
  Effect,
  HistoryEvent,
  Item,
  RollResult,
  RulesContext,
} from "./types";

export interface DamageInput {
  amount: number;
  damageType: DamageType;
  nonlethal?: boolean;
  loss?: boolean;
  save?: "none" | "half" | "negates";
  halfAgain?: boolean;
  extraRD?: number;
  vulnerability?: boolean;
  immunity?: boolean;
  magical?: boolean;
  bypassRD?: boolean;
  reason?: string;
}
export interface DamagePreview {
  amount: number;
  steps: { label: string; amount: number }[];
  absorbed: number;
  hpDamage: number;
  healing: boolean;
}
function whole(n: number, label: string, min = 0, max = 1000000) {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${label}: informe um inteiro entre ${min} e ${max}.`);
  return n;
}
function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function previewDamage(c: Character, input: DamageInput): DamagePreview {
  const d = calculate(c);
  let amount = whole(input.amount, "Dano");
  const steps = [
    { label: input.loss ? "Perda de vida" : "Valor original", amount },
  ];
  if (input.loss)
    return { amount, steps, absorbed: 0, hpDamage: amount, healing: false };
  const element = String(c.choices.element ?? "fogo");
  const undead = c.raceId === "osteon";
  const heals =
    (undead && input.damageType === "trevas") ||
    (c.raceId === "golem" && element === input.damageType && !!input.magical);
  if (heals) {
    amount = c.raceId === "golem" ? Math.floor(amount / 2) : amount;
    steps.push({ label: "Natureza da criatura: recupera PV", amount });
    return { amount, steps, absorbed: 0, hpDamage: 0, healing: true };
  }
  const mods = [
    ...c.modifiers,
    ...c.effects.filter((e) => e.active).flatMap((e) => e.modifiers),
    ...c.inventory
      .filter((i) => i.benefit && ["wielded", "worn"].includes(i.state))
      .flatMap((i) => i.modifiers),
  ].filter((m) => !m.condition);
  const immune =
    input.immunity ||
    (c.raceId === "golem" && element === input.damageType) ||
    mods.some(
      (m) => m.target === `immunity:${input.damageType}` && m.value > 0,
    );
  if (immune) {
    amount = 0;
    steps.push({ label: "Imunidade", amount });
  }
  if (input.save && input.save !== "none") {
    amount = input.save === "negates" ? 0 : Math.floor(amount / 2);
    steps.push({ label: "Teste de resistência informado", amount });
  }
  if (input.halfAgain) {
    amount = Math.floor(amount / 2);
    steps.push({ label: "Redução à metade (ex.: Durão)", amount });
  }
  const vulnerable =
    input.vulnerability ||
    (c.raceId === "kliren" && input.damageType === "impacto") ||
    (c.raceId === "trog" && input.damageType === "frio") ||
    mods.some(
      (m) => m.target === `vulnerability:${input.damageType}` && m.value > 0,
    );
  if (vulnerable) {
    amount = Math.floor(amount * 1.5);
    steps.push({ label: "Vulnerabilidade (×1,5)", amount });
  }
  let racial = 0;
  if (
    c.raceId === "osteon" &&
    ["corte", "frio", "perfuração"].includes(input.damageType)
  )
    racial = 5;
  if (c.raceId === "qareen" && element === input.damageType) racial = 10;
  const typed = value(
    [],
    mods.filter((m) => m.target === `rd:${input.damageType}`),
  ).total;
  const rd = input.bypassRD
    ? 0
    : Math.max(0, d.rd.total + racial + typed + (input.extraRD ?? 0));
  if (rd) {
    amount = Math.max(0, amount - rd);
    steps.push({ label: `Redução de dano ${rd}`, amount });
  }
  const absorbed = Math.min(amount, temporaryTotal(c, "hp"));
  if (absorbed)
    steps.push({
      label: `PV temporários absorvem ${absorbed}`,
      amount: amount - absorbed,
    });
  return {
    amount,
    steps,
    absorbed,
    hpDamage: amount - absorbed,
    healing: false,
  };
}
export type Command = CommandAction & { physicalRolls?: PhysicalRoll[] };
type CommandAction =
  | { type: "edit"; character: Character; reason: string }
  | { type: "damage"; input: DamageInput }
  | {
      type: "resource";
      kind: "hp" | "mp";
      amount: number;
      mode: "recover" | "spend" | "set";
      reason: string;
    }
  | {
      type: "temporary";
      kind: "hp" | "mp";
      amount: number;
      source: string;
      duration: "scene" | "day";
    }
  | {
      type: "rest";
      quality: "poor" | "normal" | "comfortable" | "luxurious";
      hours: number;
      specialConditions?: boolean;
    }
  | {
      type: "condition";
      condition: string;
      remove?: string;
      duration?: string;
      source?: string;
    }
  | { type: "effect"; effect: Effect }
  | { type: "removeEffect"; id: string }
  | { type: "combatStart"; initiative: number }
  | { type: "turnStart"; sustain: string[] }
  | { type: "turnEnd" }
  | { type: "roundNext"; keepRage?: boolean }
  | { type: "initiative"; initiative: number; edge: "before" | "after" }
  | { type: "sceneEnd" }
  | { type: "time"; minutes: number }
  | {
      type: "event";
      event: "hostile" | "attacked" | "stabilize" | "violation";
      detail?: string;
    }
  | { type: "action"; action: ActionType; label: string }
  | {
      type: "roll";
      expression: string;
      label: string;
      skill?: string;
      dc?: number;
      context?: RulesContext;
      rerollOf?: string;
    }
  | {
      type: "attack";
      attackId: string;
      target: string;
      defense?: number;
      bonus: number;
      extraDamage: string;
      context?: RulesContext;
      nonlethal?: boolean;
      ammoId?: string;
      criticalConfirm?: boolean;
      abilities?: AttackOptions;
    }
  | {
      type: "use";
      entryId: string;
      acquisitionId?: string;
      cost: number;
      target: string;
      enhancements: Record<string, number>;
      sourceClass: string;
      applyToSelf: boolean;
      choices: Record<string, string>;
      context?: RulesContext;
      casting?: CastingContext;
    }
  | { type: "equip"; itemId: string; state: Item["state"]; benefit: boolean }
  | {
      type: "consume";
      itemId: string;
      quantity: number;
      effect?: { kind: "hp" | "mp"; expression: string };
    }
  | {
      type: "craft";
      item: Item;
      cost: number;
      days: number;
      skill: string;
      dc: number;
      take10: boolean;
    }
  | { type: "repairDevice"; acquisitionId: string }
  | { type: "level"; character: Character; resourceMode: "keep" | "increase" };

export interface CommandResult {
  character: Character;
  event: HistoryEvent;
}
export function spendResource(c: Character, kind: "hp" | "mp", amount: number) {
  whole(amount, "Custo");
  let left = amount;
  if (kind === "mp")
    demand(
      c.mp + temporaryTotal(c, "mp") >= amount,
      "Pontos de mana insuficientes.",
    );
  for (const pool of c.temporary.filter((p) => p.kind === kind)) {
    const consumed = Math.min(pool.value, left);
    pool.value -= consumed;
    left -= consumed;
  }
  c.temporary = c.temporary.filter((p) => p.value > 0);
  c[kind] -= left;
}
function recover(c: Character, kind: "hp" | "mp", amount: number) {
  whole(amount, "Recuperação");
  if (kind === "mp")
    demand(
      c.combat.day >= Number(c.choices.manaLockedUntilDay ?? 0),
      "O código violado impede recuperar PM até o próximo dia.",
    );
  if (kind === "hp") {
    demand(
      c.hp > Math.min(-10, Math.floor(-calculate(c).hp.total / 2)),
      "O personagem morreu; recuperação comum não o ressuscita.",
    );
    const healedNonlethal = Math.min(c.nonlethal, amount);
    c.nonlethal -= healedNonlethal;
    amount -= healedNonlethal;
    if (amount > 0)
      c.effects = c.effects.filter((e) => e.condition !== "sangrando");
  }
  c[kind] = Math.min(calculate(c)[kind].total, c[kind] + amount);
}
export function consumeAction(c: Character, action: ActionType) {
  const conditions = calculate(c).conditions;
  demand(
    !conditions.includes("inconsciente"),
    "O personagem está inconsciente.",
  );
  if (!c.combat.active) return;
  if (action === "reacao") return;
  demand(
    c.combat.phase === "turn",
    "Inicie o turno antes de realizar esta ação.",
  );
  demand(
    !conditions.some((x) =>
      ["atordoado", "paralisado", "surpreendido"].includes(x),
    ),
    "Esta condição impede ações no turno.",
  );
  if (action === "livre") return;
  c.combat.pending = [];
  if (action === "completa") {
    demand(
      !conditions.includes("enjoado"),
      "Enjoado impede combinar padrão e movimento.",
    );
    demand(
      c.combat.standard >= 1 && c.combat.movement >= 1,
      "Ação completa exige uma ação padrão e uma de movimento.",
    );
    c.combat.standard--;
    c.combat.movement--;
  } else if (action === "padrao") {
    demand(c.combat.standard >= 1, "Não há ação padrão disponível.");
    c.combat.standard--;
  } else if (c.combat.movement > 0) c.combat.movement--;
  else {
    demand(
      c.combat.standard >= 1,
      "Não há ação de movimento ou padrão para converter.",
    );
    c.combat.standard--;
  }
  if (conditions.includes("enjoado")) {
    c.combat.standard = 0;
    c.combat.movement = 0;
  }
}
function expire(c: Character, edge: "before" | "after") {
  c.effects = c.effects.filter((e) => {
    if (!e.active) return true;
    const dur = e.duration;
    if (!["round", "minute", "hour", "day"].includes(dur.unit)) return true;
    const rounds =
      dur.value *
      ({ round: 1, minute: 10, hour: 600, day: 14400 }[dur.unit as "round"] ??
        1);
    const endRound = e.startedRound + rounds;
    const reached =
      c.combat.round > endRound ||
      (c.combat.round === endRound &&
        (c.combat.cursor < dur.anchor ||
          (c.combat.cursor === dur.anchor &&
            (dur.end === "before" || edge === "after"))));
    e.duration.remaining = Math.max(
      0,
      dur.value -
        (c.combat.round - e.startedRound) /
          ({ round: 1, minute: 10, hour: 600, day: 14400 }[
            dur.unit as "round"
          ] ?? 1),
    );
    return !reached;
  });
  c.temporary = c.temporary.filter(
    (p) => !p.effectId || c.effects.some((e) => e.id === p.effectId),
  );
}
function advanceEffectTime(c: Character, minutes: number) {
  c.effects = c.effects.filter((e) => {
    const unitMinutes = { round: 0.1, minute: 1, hour: 60, day: 1440 }[
      e.duration.unit as "round"
    ];
    if (!unitMinutes) return true;
    e.duration.remaining -= minutes / unitMinutes;
    e.duration.value = e.duration.remaining;
    e.startedRound = c.combat.round;
    return e.duration.remaining > 0;
  });
  c.temporary = c.temporary.filter(
    (p) => !p.effectId || c.effects.some((e) => e.id === p.effectId),
  );
}
function endScene(c: Character) {
  c.effects = c.effects.filter(
    (e) => !["scene", "sustained"].includes(e.duration.unit),
  );
  c.temporary = c.temporary.filter(
    (p) =>
      p.duration !== "scene" &&
      (!p.effectId || c.effects.some((e) => e.id === p.effectId)),
  );
  c.combat.active = false;
  c.combat.scene++;
  c.combat.used = [];
  c.combat.pending = [];
}
export function execute(original: Character, command: Command): CommandResult {
  let c = structuredClone(original);
  const before = structuredClone(original);
  const rolls: RollResult[] = [];
  let physicalIndex = 0;
  let title = "",
    detail = "",
    kind = command.type;
  const rolled = (expression: string, label = "Resultado da mesa") => {
    let r: RollResult;
    if (command.physicalRolls !== undefined) {
      if (diceSides(expression).length === 0) r = physicalRoll(expression, []);
      else {
        const input = command.physicalRolls[physicalIndex++];
        if (!input) throw new PhysicalRollRequired(expression, label);
        demand(
          input.expression === expression,
          "O cálculo mudou. Confira os dados novamente.",
        );
        r = physicalRoll(expression, input.values);
      }
    } else r = roll(expression);
    rolls.push(r);
    return r;
  };
  const d = calculate(c);
  switch (command.type) {
    case "edit": {
      demand(command.reason.trim(), "Descreva a alteração.");
      demand(command.character.id === c.id, "Identificador incompatível.");
      c = structuredClone(command.character);
      title = "Ficha atualizada";
      detail = command.reason;
      break;
    }
    case "damage": {
      const p = previewDamage(c, command.input);
      title = p.healing
        ? "Energia convertida em recuperação"
        : command.input.loss
          ? "Perda de vida"
          : command.input.nonlethal
            ? "Dano não letal"
            : "Dano recebido";
      detail =
        p.steps.map((s) => `${s.label}: ${s.amount}`).join(" → ") +
        (command.input.reason ? ` · ${command.input.reason}` : "");
      if (p.healing) recover(c, "hp", p.amount);
      else if (command.input.loss) c.hp -= p.amount;
      else if (command.input.nonlethal) {
        let absorb = p.absorbed;
        for (const pool of c.temporary.filter((p) => p.kind === "hp")) {
          const used = Math.min(pool.value, absorb);
          pool.value -= used;
          absorb -= used;
        }
        c.nonlethal += p.hpDamage;
      } else spendResource(c, "hp", p.amount);
      if (
        !p.healing &&
        c.hp <= 0 &&
        !c.effects.some((e) => e.condition === "sangrando")
      )
        c.effects.push(
          conditionEffect(c, "sangrando", "permanente", "PV chegaram a zero"),
        );
      if (command.input.amount > 0) c.combat.hostile = true;
      break;
    }
    case "resource": {
      whole(
        command.amount,
        "Valor",
        command.mode === "set" && command.kind === "hp" ? -1000000 : 0,
      );
      demand(command.reason.trim(), "Identifique a origem da alteração.");
      if (command.mode === "set") {
        demand(
          command.amount <= d[command.kind].total,
          "O valor excede o máximo; use recursos temporários.",
        );
        c[command.kind] = command.amount;
      } else if (command.mode === "spend")
        spendResource(c, command.kind, command.amount);
      else recover(c, command.kind, command.amount);
      title = `${command.kind === "hp" ? "PV" : "PM"} ${command.mode === "recover" ? "recuperados" : command.mode === "spend" ? "gastos" : "ajustados"}`;
      detail = `${command.amount} · ${command.reason}`;
      break;
    }
    case "temporary": {
      whole(command.amount, "Quantidade");
      demand(command.source.trim(), "Informe a fonte.");
      c.temporary = c.temporary.filter(
        (p) => !(p.kind === command.kind && p.source === command.source),
      );
      c.temporary.push({
        id: uid(),
        kind: command.kind,
        value: command.amount,
        source: command.source,
        duration: command.duration,
      });
      title = "Recurso temporário";
      detail = `${command.amount} ${command.kind === "hp" ? "PV" : "PM"} · ${command.source}`;
      break;
    }
    case "rest": {
      demand(!c.combat.active, "Encerre o combate antes de descansar.");
      demand(
        command.hours >= 8,
        "Um descanso completo requer oito horas (p. 106).",
      );
      const factor = { poor: 0.5, normal: 1, comfortable: 2, luxurious: 3 }[
        command.quality
      ];
      const amount = Math.floor(d.level * factor);
      c.combat.day++;
      if (!["golem", "osteon"].includes(c.raceId)) {
        recover(c, "hp", amount);
        recover(c, "mp", amount);
      } else if (c.raceId === "osteon") {
        demand(
          command.specialConditions,
          "O osteon precisa passar oito horas sob a luz das estrelas ou no subterrâneo (p. 29).",
        );
        recover(c, "hp", d.level);
        recover(c, "mp", d.level);
      } else {
        recover(c, "hp", d.level);
        recover(c, "mp", d.level);
      }
      c.temporary = c.temporary.filter((p) => p.duration !== "day");
      c.combat.elapsedMinutes += command.hours * 60;
      endScene(c);
      advanceEffectTime(c, command.hours * 60);
      c.acquisitions.forEach((a) => (a.uses = 0));
      c.combat.used = [];
      title = "Descanso completo";
      detail = `${command.hours}h · recuperação base ${amount} PV e PM; regras da raça aplicadas.`;
      break;
    }
    case "condition": {
      if (command.remove) {
        c.effects = c.effects.filter((e) => e.id !== command.remove);
        title = "Condição removida";
      } else {
        const e = conditionEffect(
          c,
          command.condition,
          command.duration ?? "cena",
          command.source ?? "Acontecimento informado",
        );
        const race = RACE_MAP.get(c.raceId);
        demand(
          !(
            race &&
            ["morto-vivo", "construto"].includes(race.type) &&
            ["fatigado", "exausto", "envenenado"].includes(command.condition)
          ),
          "A natureza desta criatura concede imunidade a essa condição.",
        );
        c.effects.push(e);
        title = "Condição aplicada";
      }
      detail = command.condition;
      break;
    }
    case "effect":
      c.effects.push(structuredClone(command.effect));
      title = "Efeito aplicado";
      detail = command.effect.name;
      break;
    case "removeEffect": {
      const e = c.effects.find((e) => e.id === command.id);
      demand(e, "Efeito não encontrado.");
      title = "Efeito encerrado";
      detail = e.name;
      c.effects = c.effects.filter((e) => e.id !== command.id);
      c.temporary = c.temporary.filter((p) => p.effectId !== command.id);
      break;
    }
    case "combatStart": {
      demand(!c.combat.active, "O combate já está em andamento.");
      whole(command.initiative, "Iniciativa", -1000, 1000);
      c.combat = {
        ...c.combat,
        active: true,
        round: 1,
        turn: 0,
        phase: "before",
        initiative: command.initiative,
        cursor: command.initiative,
        standard: 1,
        movement: 1,
        attacked: false,
        hostile: false,
        used: [],
        pending: [],
      };
      c.effects.forEach((e) => {
        e.startedRound = 1;
        e.duration.value = e.duration.remaining;
        e.duration.anchor = command.initiative;
      });
      title = "Combate iniciado";
      detail = `Iniciativa ${command.initiative}`;
      break;
    }
    case "turnStart": {
      demand(
        c.combat.active && c.combat.phase === "before",
        "O início do turno já foi processado.",
      );
      c.combat.cursor = c.combat.initiative;
      expire(c, "before");
      c.combat.phase = "turn";
      c.combat.turn++;
      c.combat.standard = 1;
      c.combat.movement = 1;
      c.combat.pending = [];
      const sustained = c.effects.filter((e) => e.active && e.maintenance > 0);
      const current = calculate(c);
      const canSustain = !current.conditions.some((x) =>
        ["inconsciente", "atordoado", "paralisado", "surpreendido"].includes(x),
      );
      const chosen = canSustain
        ? sustained.filter((e) => command.sustain.includes(e.id))
        : [];
      demand(
        chosen.filter((e) => e.source === "magia").length <=
          (has(c, "Fluxo de Mana") ? 2 : 1),
        "Só é possível sustentar uma magia por vez.",
      );
      spendResource(
        c,
        "mp",
        chosen.reduce((sum, e) => sum + e.maintenance, 0),
      );
      c.effects = c.effects.filter(
        (e) => !sustained.includes(e) || chosen.includes(e),
      );
      if (current.conditions.includes("sangrando")) {
        const r = rolled(
          `1d20${current.attributes.con.total >= 0 ? "+" : ""}${current.attributes.con.total}`,
          "Sangramento: Constituição contra CD 15",
        );
        if (r.natural === 20 || (r.natural !== 1 && r.total >= 15))
          c.effects = c.effects.filter((e) => e.condition !== "sangrando");
        else {
          const loss = rolled("1d6", "PV perdidos por sangramento");
          c.hp -= loss.total;
        }
        detail = "Sangramento: teste de Constituição CD 15 registrado. ";
      }

      title = "Início do turno";
      detail += `Rodada ${c.combat.round} · ${chosen.length} efeito(s) sustentado(s).`;
      break;
    }
    case "turnEnd": {
      demand(
        c.combat.active && c.combat.phase === "turn",
        "Não há turno iniciado.",
      );
      c.combat.phase = "after";
      expire(c, "after");
      title = "Fim do turno";
      detail = `Rodada ${c.combat.round}`;
      break;
    }
    case "roundNext": {
      demand(
        c.combat.active && c.combat.phase === "after",
        "Encerre o turno antes de avançar a rodada.",
      );
      const rage = c.effects.find((e) => e.active && slug(e.name) === "furia");
      if (rage && !c.combat.attacked && !c.combat.hostile) {
        if (command.keepRage && has(c, "Fúria Raivosa"))
          spendResource(c, "mp", 1);
        else c.effects = c.effects.filter((e) => e.id !== rage.id);
      }
      c.combat.round++;
      c.combat.freeSpellUsed = false;
      c.combat.phase = "before";
      c.combat.cursor = 1000;
      c.combat.attacked = false;
      c.combat.hostile = false;
      c.combat.used = c.combat.used.filter((x) => x.startsWith("scene:"));
      c.combat.elapsedMinutes += 0.1;
      expire(c, "before");
      title = "Nova rodada";
      detail = `Rodada ${c.combat.round}`;
      break;
    }
    case "initiative": {
      demand(c.combat.active, "Inicie o combate.");
      whole(command.initiative, "Iniciativa", -1000, 1000);
      demand(
        command.initiative <= c.combat.cursor,
        "A iniciativa deve avançar em ordem decrescente.",
      );
      c.combat.cursor = command.initiative;
      expire(c, command.edge);
      title = "Iniciativa avançada";
      detail = `${command.edge === "before" ? "Antes" : "Depois"} da iniciativa ${command.initiative}`;
      break;
    }
    case "sceneEnd":
      endScene(c);
      title = "Cena encerrada";
      detail = "Efeitos de cena e sustentados encerrados.";
      break;
    case "time": {
      whole(command.minutes, "Minutos", 1);
      demand(!c.combat.active, "Durante combate, avance turnos e rodadas.");
      c.combat.elapsedMinutes += command.minutes;
      c.combat.day += Math.floor(command.minutes / 1440);
      advanceEffectTime(c, command.minutes);
      title = "Tempo avançado";
      detail = `${command.minutes} minuto(s)`;
      break;
    }
    case "event": {
      if (command.event === "hostile") c.combat.hostile = true;
      if (command.event === "attacked") c.combat.attacked = true;
      if (command.event === "stabilize")
        c.effects = c.effects.filter((e) => e.condition !== "sangrando");
      if (command.event === "violation") {
        c.mp = 0;
        c.choices.manaLockedUntilDay = String(c.combat.day + 1);
        c.temporary = c.temporary.filter((p) => p.kind !== "mp");
      }
      title = {
        hostile: "Efeito hostil recebido",
        attacked: "Ataque informado",
        stabilize: "Estabilização informada",
        violation: "Violação de código",
      }[command.event];
      detail = command.detail ?? "";
      break;
    }
    case "action":
      consumeAction(c, command.action);
      title = command.label;
      detail = `Ação ${ACTION_LABELS[command.action].toLowerCase()}`;
      break;
    case "roll": {
      if (command.skill) {
        const skill = command.skill;
        demand(d.skills[skill], "Perícia desconhecida.");
      }
      const r = rolled(command.expression, command.label);
      title = command.label;
      detail = `${r.expression} = ${r.total}${command.dc !== undefined ? ` · CD ${command.dc}: ${r.natural === 20 || (r.natural !== 1 && r.total >= command.dc) ? "sucesso" : "falha"}` : ""}${command.rerollOf ? ` · nova rolagem vinculada a ${command.rerollOf}` : ""}`;
      break;
    }
    case "attack": {
      const dd = calculate(c, { ...command.context, target: command.target });
      const attack = dd.attacks.find((a) => a.id === command.attackId);
      demand(attack, "Ataque indisponível.");
      const plan = attackPlan(c, command.attackId, command.abilities);
      demand(!plan.errors.length, plan.errors.join(" "));
      if (command.abilities?.extra) {
        consumeAction(c, "livre");
        c.combat.pending = c.combat.pending.filter(
          (x) => x !== command.abilities!.extra,
        );
        c.combat.used.push(`round:${command.abilities.extra}`);
      } else consumeAction(c, "padrao");
      spendResource(c, "mp", plan.cost);
      whole(command.bonus, "Modificador", -1000, 1000);
      let bonus = attack.toHit.total + command.bonus + plan.hit;
      const unarmed = attack.id === "unarmed";
      const flexible = has(c, "Briga") || has(c, "Estilo Desarmado");
      if (
        (command.nonlethal && !unarmed && !has(c, "Ataque Piedoso")) ||
        (!command.nonlethal && unarmed && !flexible)
      )
        bonus -= 5;
      const r = rolled(
        `1d20${bonus >= 0 ? "+" : ""}${bonus}`,
        `Ataque: ${attack.name}`,
      );
      const hit =
        r.natural !== 1 &&
        (r.natural === 20 ||
          command.defense === undefined ||
          r.total >= command.defense);
      const critical = hit && (r.natural ?? 0) >= attack.threat;
      let expression = attack.damageExpression;
      if (critical)
        expression = criticalExpression(expression, attack.critical);
      if (plan.damage) expression += "+" + plan.damage;
      const dmg = hit
        ? rolled(
            expression,
            `${critical ? "Dano crítico" : "Dano"}: ${attack.name}`,
          )
        : undefined;
      if (hit && command.extraDamage)
        rolled(command.extraDamage, "Dano adicional");
      if (hit && plan.divineDice)
        rolled(
          `${plan.divineDice}d${plan.divineSides}`,
          "Dano do Golpe Divino",
        );
      const weapon = c.inventory.find((i) => i.id === attack.itemId);
      const ammunitionType = /arco/i.test(weapon?.name ?? "")
        ? "flechas"
        : /besta/i.test(weapon?.name ?? "")
          ? "virotes"
          : /pistola|mosquete/i.test(weapon?.name ?? "")
            ? "balas"
            : /funda/i.test(weapon?.name ?? "")
              ? "pedras"
              : "";
      if (command.ammoId || ammunitionType) {
        demand(
          attack.skill === "pontaria",
          "Apenas ataques à distância utilizam munição.",
        );
        const item = c.inventory.find((i) =>
          command.ammoId
            ? i.id === command.ammoId
            : i.category === "Munição" &&
              slug(i.name).startsWith(ammunitionType) &&
              i.quantity > 0 &&
              i.state !== "stored",
        );
        demand(
          item &&
            item.category === "Munição" &&
            item.quantity >= 1 &&
            item.state !== "stored",
          "Munição indisponível.",
        );
        item.quantity--;
      }
      c.combat.attacked = true;
      if (!command.abilities?.extra)
        c.combat.pending = ["ataque-extra", "frenesi", "golpe-relampago"];
      c.effects = c.effects.filter(
        (x) =>
          slug(x.name) !== "duelo" || !x.target || x.target === command.target,
      );
      title = `Ataque: ${attack.name}`;
      detail = `${command.target || "Alvo"} · ataque ${r.total}${r.natural === 1 ? " (1 natural)" : r.natural === 20 ? " (20 natural)" : ""} · ${hit ? (critical ? "ameaça de crítico" : "acerto") : "falha"}${dmg ? ` · dano ${rolls.slice(1).reduce((sum, r) => sum + r.total, 0)} ${attack.damageType}` : ""}${plan.cost ? ` · ${plan.cost} PM` : ""}${command.defense === undefined ? " · Defesa do alvo não informada; resultado sujeito à confirmação." : ""}`;
      break;
    }
    case "use": {
      const e = ENTRY_MAP.get(command.entryId);
      demand(e, "Registro não encontrado.");
      demand(
        characterEntries(c).some((x) => x.id === e.id),
        "O personagem não possui esta habilidade ou magia.",
      );
      const ac = c.acquisitions.find((a) => a.id === command.acquisitionId);
      demand(
        !command.acquisitionId || ac?.entryId === e.id,
        "A origem de aprendizagem não corresponde à magia escolhida.",
      );
      const usage = usageFor(c, e);
      demand(
        ![
          "Ataque Especial",
          "Golpe Divino",
          "Ataque Extra",
          "Frenesi",
          "Golpe Relâmpago",
        ].includes(e.name),
        "Escolha esta habilidade na janela de ataque; custo e efeito são aplicados junto com o golpe.",
      );
      let cost = whole(command.cost, "Custo"),
        action = usage.action;
      const isDevice = ac?.mode === "device";
      const plan =
        e.kind === "spell"
          ? magicPlan(
              c,
              e,
              ac,
              ac?.source ?? command.sourceClass,
              command.enhancements,
              command.casting,
            )
          : undefined;
      if (plan) {
        demand(!plan.errors.length, plan.errors.join(" "));
        cost = plan.cost;
        action = plan.action;
        if (action === "livre" && c.combat.active) {
          demand(
            !c.combat.freeSpellUsed,
            "Só uma magia como ação livre por rodada.",
          );
          c.combat.freeSpellUsed = true;
        }
        const prospective = createEffect(
          c,
          e,
          cost,
          command.sourceClass,
          command.target,
          command.enhancements,
          command.choices,
        );
        if (prospective.maintenance && e.kind === "spell")
          demand(
            c.effects.filter(
              (x) =>
                x.active &&
                x.maintenance > 0 &&
                x.source === (isDevice ? "habilidade" : "magia") &&
                x.entryId !== e.id,
            ).length < (isDevice ? 1 : has(c, "Fluxo de Mana") ? 2 : 1),
            "Encerre um efeito sustentado antes de iniciar outro.",
          );
        const total = c.coins.tc / 10 + c.coins.ts + c.coins.to * 10;
        demand(
          total >= plan.gold,
          "Tibares insuficientes para os componentes materiais.",
        );
        if (plan.gold) {
          const remaining = Math.round((total - plan.gold) * 10);
          c.coins = {
            to: 0,
            ts: Math.floor(remaining / 10),
            tc: remaining % 10,
          };
        }
        c.sacrifice += plan.sacrifice;
        c.combat.elapsedMinutes += plan.durationMinutes;
      } else {
        if (e.name === "Forma Selvagem") {
          const form = formPlan(c, command.choices);
          demand(!form.errors.length, form.errors.join(" "));
          cost = form.cost;
        }
        demand(
          cost >= usage.minimum && cost <= usage.maximum,
          `Custo deve ficar entre ${usage.minimum} e ${usage.maximum} PM.`,
        );
        if (d.conditions.includes("alquebrado")) cost++;
      }
      if (usage.limit) {
        const key = `${usage.limit}:${e.id}`;
        demand(
          !c.combat.used.includes(key),
          "Esta habilidade já foi utilizada neste intervalo.",
        );
        c.combat.used.push(key);
      }
      consumeAction(c, action);
      spendResource(c, "mp", cost);
      title = `${isDevice ? "Engenhoca" : e.kind === "spell" ? "Magia" : "Habilidade"}: ${e.name}`;
      detail = `${cost} PM · ${ACTION_LABELS[action]} · ${command.target || "sem alvo especificado"}`;
      let failed = false;
      for (const check of plan?.checks ?? []) {
        const r = rolled(
          "1d20" + (check.bonus >= 0 ? "+" : "") + check.bonus,
          `${check.label} contra CD ${check.dc}`,
        );
        const success =
          r.natural === 20 || (r.natural !== 1 && r.total >= check.dc);
        detail +=
          " · " +
          check.label +
          ": " +
          r.total +
          " contra CD " +
          check.dc +
          ": " +
          (success ? "sucesso" : "falha; PM e componentes consumidos");
        if (isDevice && ac) {
          ac.uses = (ac.uses ?? 0) + 1;
          if (!success) ac.broken = true;
        }
        if (!success) {
          failed = true;
          break;
        }
      }
      if (failed) break;
      const name = slug(e.name);
      if (name === "surto-heroico") c.combat.standard++;
      if (name === "velocidade-ladina") c.combat.movement++;
      if (command.applyToSelf && name === "cura-pelas-maos") {
        const heal = rolled(
          `${Math.max(1, cost)}d8+${Math.max(1, cost)}`,
          "Cura pelas Mãos",
        );
        if (c.raceId === "osteon") spendResource(c, "hp", heal.total);
        else recover(c, "hp", heal.total);
        detail += ` · ${heal.total} PV`;
      } else if (command.applyToSelf && name === "curar-ferimentos") {
        const enhancements =
          e.enhancements?.filter(
            (h) => (command.enhancements[h.id] ?? 0) > 0,
          ) ?? [];
        const trick = enhancements.some((h) => h.trick);
        demand(
          !trick || c.raceId === "osteon",
          "O truque de Curar Ferimentos só afeta mortos-vivos.",
        );
        const diceCount =
          2 +
          enhancements
            .filter((h) => h.text.startsWith("aumenta a cura"))
            .reduce((sum, h) => sum + command.enhancements[h.id], 0);
        const healing = rolled(
          trick ? "1d8" : `${diceCount}d8+${diceCount}`,
          "Curar Ferimentos",
        );
        if (c.raceId === "osteon") spendResource(c, "hp", healing.total);
        else recover(c, "hp", healing.total);
        if (enhancements.some((h) => h.text.includes("condição de fadiga"))) {
          const fatigue = c.effects.find((x) =>
            ["fatigado", "exausto"].includes(x.condition ?? ""),
          );
          if (fatigue) c.effects = c.effects.filter((x) => x.id !== fatigue.id);
        }
        detail += ` · ${healing.total} PV`;
      } else {
        const effect = createEffect(
          c,
          e,
          cost,
          command.sourceClass,
          command.target,
          command.enhancements,
          command.choices,
        );
        if (isDevice) {
          effect.source = "habilidade";
          effect.modifiers.forEach((m) => (m.source = "habilidade"));
        }
        if (plan?.penalty)
          effect.modifiers.push({
            id: uid(),
            label: `Penalidade: ${e.name}`,
            target: "mp",
            source: effect.source,
            sourceId: e.id,
            value: -plan.penalty,
            page: e.page,
          });
        if (command.applyToSelf && name === "heroismo") {
          c.temporary = c.temporary.filter((p) => p.source !== "Heroísmo");
          c.temporary.push({
            id: uid(),
            kind: "hp",
            value: 40,
            source: "Heroísmo",
            duration: "scene",
          });
        }
        const diceDuration = usage.duration.match(/\d+d\d+/)?.[0];
        if (diceDuration) {
          effect.duration.value = effect.duration.remaining = rolled(
            diceDuration,
            `Duração: ${e.name}`,
          ).total;
        }
        if (effect.duration.unit !== "instant") {
          if (!command.applyToSelf) effect.modifiers = [];
          c.effects = c.effects.filter(
            (x) =>
              x.entryId !== e.id ||
              x.target !== command.target ||
              x.name !== effect.name,
          );
          c.effects.push(effect);
        }
      }
      break;
    }
    case "equip": {
      const i = c.inventory.find((i) => i.id === command.itemId);
      demand(i && i.quantity > 0, "Item indisponível.");
      const prospective = structuredClone(c);
      const next = prospective.inventory.find((x) => x.id === i.id)!;
      next.state = command.state;
      next.benefit = command.benefit;
      demand(
        prospective.inventory
          .filter((x) => x.quantity > 0 && x.state === "wielded")
          .reduce((n, x) => n + x.hands, 0) <= 2,
        "Não há mãos livres para empunhar este item.",
      );
      demand(
        prospective.inventory.filter(
          (x) =>
            x.quantity > 0 &&
            x.benefit &&
            x.state === "worn" &&
            x.category.startsWith("Armadura"),
        ).length <= 1,
        "Só é possível vestir uma armadura.",
      );
      demand(
        prospective.inventory.filter(
          (x) =>
            x.quantity > 0 &&
            x.benefit &&
            ["worn", "wielded"].includes(x.state) &&
            x.category === "Escudo",
        ).length <= 1,
        "Só um escudo pode fornecer Defesa.",
      );
      if (c.combat.active) {
        if (i.heavy && command.state === "worn")
          throw new Error(
            "Vestir armadura pesada leva cinco minutos; faça isso fora do combate.",
          );
        consumeAction(
          c,
          i.category.startsWith("Armadura") ? "completa" : "movimento",
        );
      }
      i.state = command.state;
      i.benefit = command.benefit;
      title = "Equipamento alterado";
      detail = `${i.name} · ${{ stored: "guardado", carried: "carregado", worn: "vestido", wielded: "empunhado" }[i.state]}`;
      break;
    }
    case "consume": {
      const i = c.inventory.find((i) => i.id === command.itemId);
      demand(i && i.state !== "stored", "Item indisponível.");
      whole(command.quantity, "Quantidade", 1);
      demand(i.quantity >= command.quantity, "Quantidade insuficiente.");
      consumeAction(c, "padrao");
      i.quantity -= command.quantity;
      title = "Item consumido";
      detail = `${i.name} × ${command.quantity}`;
      if (command.effect) {
        const r = rolled(command.effect.expression, `Recuperação: ${i.name}`);
        recover(c, command.effect.kind, Math.max(0, r.total));
        detail += ` · ${r.total} ${command.effect.kind.toUpperCase()}`;
      }
      break;
    }
    case "craft": {
      demand(!c.combat.active, "Fabricação requer tempo fora de combate.");
      demand(
        c.trained.some((t) => t.id === command.skill),
        "Treinamento neste Ofício necessário.",
      );
      demand(
        command.cost >= 0 && Number.isFinite(command.cost),
        "Custo inválido.",
      );
      const total = c.coins.tc / 10 + c.coins.ts + c.coins.to * 10;
      demand(total >= command.cost, "Tibares insuficientes para os materiais.");
      const bonus = d.skills[command.skill]?.total ?? 0;
      const check = command.take10
        ? 10 + bonus
        : rolled(
            `1d20${bonus >= 0 ? "+" : ""}${bonus}`,
            `Fabricação: Ofício contra CD ${command.dc}`,
          ).total;
      c.coins = {
        to: 0,
        ts: Math.floor(total - command.cost),
        tc: Math.round(((total - command.cost) % 1) * 10),
      };
      c.combat.elapsedMinutes += Math.max(1, command.days) * 1440;
      title = "Fabricação";
      detail = `${command.item.name} · Ofício ${check} contra CD ${command.dc} · T$ ${command.cost} em materiais`;
      if (check >= command.dc) {
        c.inventory.push(structuredClone(command.item));
        detail += " · concluída";
      } else detail += " · falha; materiais gastos registrados";
      break;
    }
    case "repairDevice": {
      const ac = c.acquisitions.find((a) => a.id === command.acquisitionId);
      demand(
        ac?.mode === "device" && ac.broken,
        "Engenhoca não está enguiçada.",
      );
      demand(!c.combat.active, "Conserto exige uma hora de trabalho.");
      ac.broken = false;
      c.combat.elapsedMinutes += 60;
      title = "Engenhoca reparada";
      detail = ENTRY_MAP.get(ac.entryId)?.name ?? "";
      break;
    }
    case "level": {
      demand(c.levels.length < 20, "Nível máximo 20.");
      demand(
        command.character.id === c.id &&
          command.character.levels.length === c.levels.length + 1,
        "A evolução deve adicionar exatamente um nível.",
      );
      demand(
        c.levels.every(
          (l, i) => l.classId === command.character.levels[i].classId,
        ),
        "Os níveis anteriores devem ser preservados.",
      );
      const next = calculate(command.character);
      const hp = c.hp,
        mp = c.mp;
      c = structuredClone(command.character);
      c.hp =
        command.resourceMode === "increase"
          ? hp + Math.max(0, next.hp.total - d.hp.total)
          : hp;
      c.mp =
        command.resourceMode === "increase"
          ? mp + Math.max(0, next.mp.total - d.mp.total)
          : mp;
      title = `Evolução para o nível ${c.levels.length}`;
      detail = `${CLASS_MAP.get(c.levels.at(-1)!.classId)?.name} · PV máximos ${d.hp.total} → ${next.hp.total} · PM máximos ${d.mp.total} → ${next.mp.total} · recursos atuais ${command.resourceMode === "keep" ? "preservados" : "acrescidos da diferença"}`;
      break;
    }
  }
  if (
    c.hp - c.nonlethal <= 0 ||
    calculate(c).conditions.includes("inconsciente")
  )
    c.effects = c.effects.filter((e) => slug(e.name) !== "forma-selvagem");
  c.temporary = c.temporary.filter(
    (p) =>
      p.value > 0 &&
      (!p.effectId || c.effects.some((e) => e.id === p.effectId)),
  );
  if (command.physicalRolls !== undefined) {
    demand(
      command.physicalRolls.length === physicalIndex,
      "Há dados que não pertencem a esta operação.",
    );
    if (rolls.length) detail += " · Dados físicos informados na mesa.";
  }
  c.revision = original.revision + 1;
  c.updatedAt = timestamp();
  return {
    character: c,
    event: {
      id: uid(),
      characterId: c.id,
      at: c.updatedAt,
      title,
      detail,
      kind,
      round: c.combat.round,
      before,
      rolls,
    },
  };
}
export function conditionEffect(
  c: Character,
  condition: string,
  duration = "cena",
  source = "Acontecimento informado",
): Effect {
  return {
    id: uid(),
    name: condition,
    condition,
    source: "condicao",
    description: source,
    modifiers: [],
    duration: durationFor(duration, c.combat.cursor),
    active: true,
    startedRound: c.combat.round,
    startedTurn: c.combat.turn,
    maintenance: 0,
  };
}
