import { useContext } from "react";
import { BookOpen } from "lucide-react";
import { CLASS_MAP, ENTRY_MAP, RACE_MAP } from "../data/rules";
import type { CatalogEntry } from "../domain/types";
import { bookReference, subjectReferences } from "./book-reference";
import { KIND_LABELS, LIBRARY_ROW_MAP } from "./library-data";
import { ReferenceContext } from "./shared";

export function BookEntryButton({ entry }: { entry: CatalogEntry }) {
  const navigation = useContext(ReferenceContext);
  const ref = bookReference(entry);
  if (!ref || !navigation) return null;
  return (
    <button
      className="text-button book-entry-link"
      onClick={() => navigation.openBook(ref.printedPage, entry.name)}
    >
      <BookOpen size={16} />
      Ver no livro · p. {ref.printedPage}
    </button>
  );
}
export function BookSubjectButton({ subject }: { subject: string }) {
  const navigation = useContext(ReferenceContext);
  const ref = subjectReferences[subject];
  if (!ref || !navigation) return null;
  return (
    <button
      className="text-button book-entry-link"
      onClick={() => navigation.openBook(ref.printedPage, ref.title)}
    >
      <BookOpen size={16} />
      Ver {ref.title} no livro · p. {ref.printedPage}
    </button>
  );
}
export function EntryReadout({ entry: e }: { entry: CatalogEntry }) {
  const row = LIBRARY_ROW_MAP.get(e.id);
  const facts = [
    ["Tipo", KIND_LABELS[e.kind] || e.kind],
    ["Categoria", e.group],
    [
      e.kind === "spell" ? "Listas básicas de classe" : "Classe",
      row?.classes.map((id) => CLASS_MAP.get(id)?.name).join(", "),
    ],
    ["Raça", row?.races.map((id) => RACE_MAP.get(id)?.name).join(", ")],
    ["Origem", row?.origins.map((id) => ENTRY_MAP.get(id)?.name).join(", ")],
    ["Tradição", e.magicType],
    ["Escola", e.school],
    ["Círculo", e.circle ? `${e.circle}º` : ""],
    ["Custo base", e.cost !== undefined ? `${e.cost} PM` : ""],
    ["Execução", e.execution],
    ["Alcance", e.range],
    ["Alvo", e.target],
    ["Área", e.area],
    ["Efeito", e.effect],
    ["Duração", e.duration],
    ["Resistência", e.resistance],
  ].filter(([, value]) => value);
  return (
    <div className="entry-readout">
      <dl className="entry-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {e.prerequisites && (
        <section className="entry-prerequisites">
          <h3>Pré-requisitos</h3>
          <p>{e.prerequisites}</p>
        </section>
      )}
      <p className="source-text">{e.description}</p>
      {!!e.enhancements?.length && (
        <details className="entry-enhancements">
          <summary>Aprimoramentos ({e.enhancements.length})</summary>
          {e.enhancements.map((enhancement) => (
            <div key={enhancement.id}>
              <strong>
                {enhancement.trick ? "Truque" : `+${enhancement.cost} PM`}
              </strong>
              <p>{enhancement.text}</p>
              {enhancement.requiresCircle > 0 && (
                <small>Requer {enhancement.requiresCircle}º círculo.</small>
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
