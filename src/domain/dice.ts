import type { RollResult } from "./types";
export interface PhysicalRoll {
  expression: string;
  values: number[];
}
export class PhysicalRollRequired extends Error {
  constructor(
    public expression: string,
    public label: string,
  ) {
    super(`Informe os dados da mesa: ${label} (${expression}).`);
  }
}
export function diceSides(expression: string): number[] {
  const sides: number[] = [];
  roll(expression, (n) => {
    sides.push(n);
    return 1;
  });
  return sides;
}
export function physicalRoll(expression: string, values: number[]): RollResult {
  let index = 0;
  const result = roll(expression, () => {
    const value = values[index++];
    if (value === undefined)
      throw new Error("Informe o resultado de todos os dados.");
    return value;
  });
  if (index !== values.length)
    throw new Error("Quantidade de dados incompatível com a expressão.");
  return result;
}
export function randomDie(sides: number): number {
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000)
    throw new Error("O dado deve ter de 2 a 1.000 faces.");
  const ceiling = Math.floor(0x100000000 / sides) * sides;
  const data = new Uint32Array(1);
  do {
    crypto.getRandomValues(data);
  } while (data[0] >= ceiling);
  return (data[0] % sides) + 1;
}
export function roll(
  expression: string,
  random: (sides: number) => number = randomDie,
): RollResult {
  const input = expression
    .toLowerCase()
    .replace(/\s/g, "")
    .replaceAll("−", "-");
  if (
    !input ||
    input.length > 180 ||
    !/^[-+]?(?:\d*d(?:%|\d+)(?:(?:kh|kl|dh|dl)\d+)?|\d+)(?:[-+](?:\d*d(?:%|\d+)(?:(?:kh|kl|dh|dl)\d+)?|\d+))*$/.test(
      input,
    )
  )
    throw new Error("Use uma expressão como 1d20+5, 2d8+2 ou 4d6kh3.");
  const terms = input.match(/[+-]?[^+-]+/g) ?? [];
  const result: RollResult = {
    expression: input,
    total: 0,
    dice: [],
    constant: 0,
  };
  let count = 0;
  for (const term of terms) {
    const factor = term.startsWith("-") ? -1 : 1;
    const t = term.replace(/^[+-]/, "");
    const m = t.match(/^(\d*)d(\d+|%)(?:(kh|kl|dh|dl)(\d+))?$/);
    if (m) {
      const qty = Number(m[1] || 1),
        sides = m[2] === "%" ? 100 : Number(m[2]);
      count += qty;
      if (
        !Number.isInteger(qty) ||
        qty < 1 ||
        count > 100 ||
        sides < 2 ||
        sides > 1000
      )
        throw new Error("Use até 100 dados, de 2 a 1.000 faces.");
      const values = Array.from({ length: qty }, () => {
        const v = random(sides);
        if (v < 1 || v > sides || !Number.isInteger(v))
          throw new Error("Resultado de dado inválido.");
        return v;
      });
      let kept = values.map((_, i) => i);
      if (m[3]) {
        const n = Number(m[4]);
        if (n < 1 || n > qty)
          throw new Error(
            "Quantidade de dados mantidos ou descartados inválida.",
          );
        const ordered = [...kept].sort((a, b) => values[b] - values[a]);
        kept =
          m[3] === "kh"
            ? ordered.slice(0, n)
            : m[3] === "kl"
              ? ordered.slice(-n)
              : m[3] === "dh"
                ? ordered.slice(n)
                : ordered.slice(0, qty - n);
      }
      result.dice.push({ sides, values, kept });
      result.total += factor * kept.reduce((s, i) => s + values[i], 0);
      if (
        sides === 20 &&
        kept.length === 1 &&
        result.dice.length === 1 &&
        factor === 1
      )
        result.natural = values[kept[0]];
    } else {
      if (!/^\d+$/.test(t) || Number(t) > 1000000)
        throw new Error("Modificador inválido.");
      result.constant += factor * Number(t);
      result.total += factor * Number(t);
    }
  }
  return result;
}
export function criticalExpression(
  expression: string,
  multiplier: number,
): string {
  return expression.replace(
    /(\d*)d(\d+)/g,
    (_, n, d) => `${Number(n || 1) * multiplier}d${d}`,
  );
}
export const STEP_TABLE = [
  ["1", "1d2", "1d3", "1d4", "1d6", "1d8"],
  ["1d2", "1d3", "1d4", "1d6", "1d8", "1d10"],
  ["1d3", "1d4", "1d6", "1d8", "1d10", "1d12"],
  ["1d4", "1d6", "1d8", "1d10", "1d12", "3d6"],
  ["1d6", "1d8", "1d10", "1d12", "3d6", "4d6"],
  ["1d8", "1d10", "1d12", "3d6", "4d6", "4d8"],
  ["1d10", "2d6", "2d8", "3d8", "4d8", "4d10"],
  ["2d6", "2d8", "2d10", "3d10", "4d10", "4d12"],
];
export function stepDamage(damage: string, steps: number): string {
  if (!steps) return damage;
  const norm =
    damage === "2d4"
      ? "1d8"
      : ["2d6", "3d4"].includes(damage)
        ? "1d12"
        : damage;
  const row = STEP_TABLE.find((r) => r[2] === norm);
  if (row && steps >= -2 && steps <= 3) return row[2 + steps];
  if (steps > 3) return stepDamage(stepDamage(damage, 3), steps - 3);
  if (steps < -2) return stepDamage(stepDamage(damage, -2), steps + 2);
  return damage === "4d12" && steps > 0 ? "4d12" : damage;
}
