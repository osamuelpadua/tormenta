import { emptyCharacter, itemFromTemplate } from "../src/domain/character";
import { calculate } from "../src/domain/calculate";
import type { Character } from "../src/domain/types";
export function hero(classId = "guerreiro", level = 1): Character {
  const c = emptyCharacter();
  c.name = "Aldren";
  c.attributes = { for: 2, des: 1, con: 2, int: 1, sab: 0, car: 0 };
  c.racialChoices = ["for", "con", "int"];
  c.levels = Array.from({ length: level }, () => ({
    classId,
    powers: [],
    notes: "",
  }));
  c.trained = [
    { id: "luta", level: 1, source: "Classe" },
    { id: "fortitude", level: 1, source: "Classe" },
    { id: "iniciativa", level: 1, source: "Classe" },
  ];
  c.hp = 100;
  c.mp = 100;
  const d = calculate(c);
  c.hp = d.hp.total;
  c.mp = d.mp.total;
  return c;
}
export function equip(c: Character, template: string) {
  const item = itemFromTemplate(template);
  item.state = item.damage || item.category === "Escudo" ? "wielded" : "worn";
  c.inventory.push(item);
  return item;
}
