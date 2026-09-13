import type { CatalogEntry } from "./types";

const spellEffects = new Set([
  "Armadura Arcana",
  "Bênção",
  "Perdição",
  "Oração",
  "Escudo da Fé",
  "Imagem Espelhada",
  "Pele de Pedra",
  "Proteção Divina",
  "Heroísmo",
  "Primor Atlético",
  "Aparência Perfeita",
  "Mente Divina",
  "Físico Divino",
  "Curar Ferimentos",
]);
export const ATTACK_ABILITIES = [
  "Ataque Especial",
  "Golpe Divino",
  "Ataque Extra",
  "Frenesi",
  "Golpe Relâmpago",
];
const effects = new Set([
  "Fúria",
  "Inspiração",
  "Baluarte",
  "Duelo",
  "Ímpeto",
  "Aura Sagrada",
  "Égide Sagrada",
  "Vingador Sagrado",
  "Armadura de Allihanna",
  "Forma Selvagem",
  "Cura pelas Mãos",
  "Surto Heroico",
  "Velocidade Ladina",
]);

/** Indexing a source is distinct from implementing every rule in it. */
export function coverageFor(entry: CatalogEntry) {
  if (ATTACK_ABILITIES.includes(entry.name))
    return {
      label: "Integrado ao ataque",
      available:
        "Custo, pré-requisitos de uso, rolagem e histórico são aplicados na janela de ataque.",
      pending:
        "Exceções de outros poderes que modifiquem este ataque ainda precisam de revisão.",
    };
  if (entry.kind === "spell")
    return {
      label: "Automação parcial",
      available:
        "Custo, ação, limite de PM, círculos, concentração e duração. " +
        (spellEffects.has(entry.name)
          ? "Há cálculos próprios para o efeito básico."
          : "O efeito desta magia ainda não tem cálculo próprio."),
      pending:
        "Aprimoramentos com efeitos específicos e interações com outras habilidades ainda não têm cobertura integral. Confira a descrição antes de aplicar.",
    };
  if (effects.has(entry.name))
    return {
      label: "Automação parcial",
      available: "Há cálculo próprio para o uso básico desta habilidade.",
      pending:
        "Escolhas avançadas e combinações ainda precisam de revisão. Os modificadores aplicados aparecem abaixo.",
    };
  return {
    label: "Revisão pendente",
    available:
      "Descrição, referência, aquisição e histórico disponíveis. Parte dos bônus passivos é calculada na ficha.",
    pending:
      "O uso completo desta regra ainda não foi implementado. Custo, ação e duração sugeridos devem ser conferidos no texto; registre efeitos ausentes no controle de condições.",
  };
}
