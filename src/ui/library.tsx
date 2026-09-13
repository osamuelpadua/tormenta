import { useDeferredValue, useMemo, useRef } from "react";
import { BookOpen, Filter, Plus, Sparkles, Star, X } from "lucide-react";
import { CLASSES, RACES } from "../data/rules";
import { characterEntries } from "../domain/character";
import { usageFor } from "../domain/effects";
import { coverageFor } from "../domain/coverage";
import type { CatalogEntry } from "../domain/types";
import { Empty, Field, Pill, SearchBox, useApp } from "./shared";
import { EntityIcon } from "./entity-icon";
import { bookReference } from "./book-reference";
import {
  EMPTY_FILTERS,
  KIND_LABELS,
  LIBRARY_ROWS,
  ORIGINS,
  filterLibrary,
  libraryContext,
  type LibraryFilters,
} from "./library-data";
import { useLibraryState } from "./library-state";

export function Library({
  spells,
  onAdd,
  onUse,
}: {
  spells: boolean;
  onAdd: () => void;
  onUse: (e: CatalogEntry) => void;
}) {
  const { character: c, commit, openEntry, openBook } = useApp();
  const [state, update] = useLibraryState(c.id, spells);
  const list = useRef<HTMLDivElement>(null);
  const query = useDeferredValue(state.query);
  const own = useMemo(() => new Set(characterEntries(c).map((e) => e.id)), [c]);
  const relation = useMemo(() => {
    const calculate = libraryContext(c);
    const cache = new Map<string, ReturnType<typeof calculate>>();
    return (e: CatalogEntry) => {
      if (!cache.has(e.id)) cache.set(e.id, calculate(e));
      return cache.get(e.id)!;
    };
  }, [c]);
  const rows = useMemo(
    () => LIBRARY_ROWS.filter((row) => (row.entry.kind === "spell") === spells),
    [spells],
  );
  const results = useMemo(() => {
    const filtered = filterLibrary(
      rows.filter(
        (row) =>
          (state.scope === "all" || own.has(row.entry.id)) &&
          (!state.favorites || c.favorites.includes(row.entry.id)),
      ),
      query,
      state.filters,
      relation,
    );
    return filtered.sort((a, b) => {
      const av =
        state.sort === "page"
          ? a.entry.page
          : state.sort === "circle"
            ? a.entry.circle
            : state.sort === "cost"
              ? a.entry.cost
              : 0;
      const bv =
        state.sort === "page"
          ? b.entry.page
          : state.sort === "circle"
            ? b.entry.circle
            : state.sort === "cost"
              ? b.entry.cost
              : 0;
      return (
        (av ?? Infinity) - (bv ?? Infinity) ||
        a.entry.name.localeCompare(b.entry.name, "pt-BR") ||
        a.entry.id.localeCompare(b.entry.id)
      );
    });
  }, [
    rows,
    state.scope,
    state.favorites,
    state.filters,
    state.sort,
    c.favorites,
    own,
    query,
    relation,
  ]);
  const page = Math.min(
    state.page,
    Math.max(0, Math.ceil(results.length / 24) - 1),
  );
  const options = (
    key: "kind" | "group" | "magicType" | "school" | "circle" | "cost",
  ) =>
    [
      ...new Set(
        rows
          .map((row) => row.entry[key])
          .filter((value) => value !== undefined && value !== ""),
      ),
    ]
      .map(String)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const filter = (key: keyof LibraryFilters, value: string) =>
    update({ filters: { ...state.filters, [key]: value }, page: 0 });
  const activeFilters = Object.values(state.filters).filter(Boolean).length;
  const pick = (entry: CatalogEntry, book = false) => {
    update({ selectedId: entry.id, scroll: window.scrollY });
    const ref = bookReference(entry);
    if (book && ref) openBook(ref.printedPage, entry.name);
    else openEntry(entry);
  };
  const select = (
    label: string,
    key: keyof LibraryFilters,
    values: { value: string; label: string }[],
  ) => (
    <Field label={label}>
      <select
        value={state.filters[key]}
        onChange={(event) => filter(key, event.target.value)}
      >
        <option value="">Todos</option>
        {values.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const simple = (values: string[]) =>
    values.map((value) => ({ value, label: value }));
  return (
    <section
      className="reference-library"
      aria-label={spells ? "Acervo de magias" : "Acervo de poderes"}
    >
      <div
        className="library-scopes"
        role="group"
        aria-label="Conteúdo exibido"
      >
        <button
          aria-pressed={state.scope === "mine"}
          onClick={() => update({ scope: "mine", page: 0 })}
        >
          {spells ? "Minhas Magias" : "Meus Poderes"}
          <span>{rows.filter((row) => own.has(row.entry.id)).length}</span>
        </button>
        <button
          aria-pressed={state.scope === "all"}
          onClick={() => update({ scope: "all", page: 0 })}
        >
          <BookOpen size={18} />
          {spells ? "Biblioteca de Magias" : "Biblioteca de Poderes"}
          <span>{rows.length}</span>
        </button>
      </div>
      <div className="library-context-line">
        <span>
          {state.scope === "mine"
            ? `Repertório de ${c.name}`
            : "Todo o acervo • Jogo do Ano"}
        </span>
        <small>
          Contexto: {c.name} · nível {c.levels.length}
        </small>
      </div>
      <div className="library-toolbar">
        <SearchBox
          value={state.query}
          onChange={(value) => update({ query: value, page: 0 })}
          placeholder={spells ? "Pesquisar magias…" : "Pesquisar poderes…"}
        />
        <button
          className="button"
          aria-expanded={state.filtersOpen}
          aria-controls="library-filters"
          onClick={() => update({ filtersOpen: !state.filtersOpen })}
        >
          <Filter size={16} />
          Filtros{activeFilters ? ` (${activeFilters})` : ""}
        </button>
        <button
          className={`button ${state.favorites ? "selected" : ""}`}
          aria-pressed={state.favorites}
          onClick={() => update({ favorites: !state.favorites, page: 0 })}
        >
          <Star size={16} />
          Favoritos
        </button>
        <button className="button primary" onClick={onAdd}>
          <Plus size={16} />
          {spells ? "Aprender magia" : "Adicionar poder"}
        </button>
      </div>
      {state.filtersOpen && (
        <div className="library-filters" id="library-filters">
          <div className="library-filter-heading">
            <strong>Refinar a consulta</strong>
            <button
              className="icon-button"
              aria-label="Recolher filtros"
              onClick={() => update({ filtersOpen: false })}
            >
              <X size={18} />
            </button>
          </div>
          <div className="library-filter-grid">
            {!spells && (
              <>
                {select(
                  "Tipo de conteúdo",
                  "kind",
                  options("kind").map((value) => ({
                    value,
                    label: KIND_LABELS[value],
                  })),
                )}
                {select("Categoria", "category", simple(options("group")))}
                {select(
                  "Classe",
                  "classId",
                  CLASSES.map((cls) => ({ value: cls.id, label: cls.name })),
                )}
                {select(
                  "Raça",
                  "raceId",
                  RACES.map((race) => ({ value: race.id, label: race.name })),
                )}
                {select(
                  "Origem",
                  "originId",
                  ORIGINS.map((origin) => ({
                    value: origin.id,
                    label: origin.name,
                  })),
                )}
                {select(
                  "Nível indicado",
                  "level",
                  simple(
                    [...new Set(rows.flatMap((row) => row.levels))]
                      .sort((a, b) => a - b)
                      .map(String),
                  ),
                )}
              </>
            )}
            {spells && (
              <>
                {select(
                  "Lista básica de classe",
                  "classId",
                  CLASSES.filter((cls) =>
                    rows.some((row) => row.classes.includes(cls.id)),
                  ).map((cls) => ({ value: cls.id, label: cls.name })),
                )}
                {select(
                  "Tipo de magia",
                  "magicType",
                  simple(options("magicType")),
                )}
                {select("Escola", "school", simple(options("school")))}
                {select("Círculo", "circle", simple(options("circle")))}
                {select("Custo base em PM", "cost", simple(options("cost")))}
              </>
            )}
            {!spells &&
              select("Pré-requisitos no texto", "prerequisites", [
                { value: "with", label: "Informados" },
                { value: "without", label: "Sem indicação" },
              ])}
            {select("Relação com o personagem", "relation", [
              { value: "owned", label: "Já possui" },
              { value: "option", label: "Opção de aprendizagem" },
              { value: "blocked", label: "Requisitos pendentes" },
              { value: "review", label: "Conferir escolha" },
            ])}
          </div>
          <p className="muted">
            Filtros se combinam. Relações exibidas vêm do catálogo; a ausência
            de um vínculo não significa proibição nas regras.
          </p>
          <div className="library-filter-actions">
            <button
              className="text-button"
              onClick={() => update({ filters: { ...EMPTY_FILTERS }, page: 0 })}
            >
              Limpar filtros
            </button>
            <button
              className="button"
              onClick={() => {
                update({ filtersOpen: false });
                list.current?.scrollIntoView({ block: "start" });
              }}
            >
              Ver {results.length} resultados
            </button>
          </div>
        </div>
      )}
      <div className="library-results-heading" ref={list}>
        <span role="status">
          {results.length} resultado{results.length === 1 ? "" : "s"}
          {activeFilters ? ` · ${activeFilters} filtro(s)` : ""}
        </span>
        <label>
          Ordenar
          <select
            aria-label="Ordenar resultados"
            value={state.sort}
            onChange={(event) =>
              update({ sort: event.target.value as typeof state.sort, page: 0 })
            }
          >
            <option value="name">Nome</option>
            <option value="page">Página do livro</option>
            {spells && (
              <>
                <option value="circle">Círculo</option>
                <option value="cost">Custo em PM</option>
              </>
            )}
          </select>
        </label>
      </div>
      <div className="library-grid" aria-busy={query !== state.query}>
        {results.slice(page * 24, (page + 1) * 24).map(({ entry: e }) => {
          const owned = own.has(e.id),
            status = relation(e),
            ref = bookReference(e);
          const usage = owned ? usageFor(c, e) : undefined;
          const ac = c.acquisitions.find((a) => a.entryId === e.id);
          return (
            <article
              className="power-card"
              data-magic={spells || undefined}
              data-selected={state.selectedId === e.id || undefined}
              key={e.id}
            >
              <div className="row between">
                <Pill tone={spells ? "blue" : "gold"}>
                  {spells
                    ? `${e.circle}º · ${e.school}`
                    : e.group || KIND_LABELS[e.kind]}
                </Pill>
                <button
                  className="icon-button"
                  aria-label={`Favoritar ${e.name}`}
                  aria-pressed={c.favorites.includes(e.id)}
                  onClick={() =>
                    void commit({
                      type: "edit",
                      character: {
                        ...c,
                        favorites: c.favorites.includes(e.id)
                          ? c.favorites.filter((id) => id !== e.id)
                          : [...c.favorites, e.id],
                      },
                      reason: `Favorito: ${e.name}`,
                    })
                  }
                >
                  <Star
                    size={16}
                    fill={c.favorites.includes(e.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <button className="power-title" onClick={() => pick(e)}>
                <span className="power-emblem">
                  <EntityIcon name={e.name} size={31} />
                </span>
                {e.name}
              </button>
              <p>
                {e.description
                  .replace(/^(Arcana|Divina|Universal).*?Duração:.*?\./s, "")
                  .slice(0, 210)}
                {e.description.length > 210 ? "…" : ""}
              </p>
              <div className="card-tags">
                <Pill
                  tone={
                    owned
                      ? "green"
                      : status.status === "blocked"
                        ? "red"
                        : "neutral"
                  }
                >
                  {status.label}
                </Pill>
                {e.cost !== undefined && <span>{e.cost} PM</span>}
                {owned && <Pill>{coverageFor(e).label}</Pill>}
                {ac?.mode === "device" && (
                  <Pill>Engenhoca{ac.broken ? " enguiçada" : ""}</Pill>
                )}
                {ac?.source === "arcanista" &&
                  c.choices.path === "Mago" &&
                  spells && (
                    <Pill>{ac.prepared ? "Memorizada" : "Não memorizada"}</Pill>
                  )}
              </div>
              <footer>
                {ref && (
                  <button
                    className="text-button"
                    onClick={() => pick(e, true)}
                    aria-label={`Ver no livro: ${e.name}, página ${ref.printedPage}`}
                  >
                    <BookOpen size={14} />
                    Ver no livro · p. {ref.printedPage}
                  </button>
                )}
                {usage?.active && (
                  <button className="button small" onClick={() => onUse(e)}>
                    {spells ? "Lançar" : "Usar"}
                    <Sparkles size={13} />
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      {!results.length && (
        <Empty
          heading="Nenhum resultado"
          icon={<BookOpen />}
          action={
            <button
              className="button"
              onClick={() =>
                update({
                  query: "",
                  filters: { ...EMPTY_FILTERS },
                  favorites: false,
                  page: 0,
                  scope: "all",
                })
              }
            >
              Explorar toda a biblioteca
            </button>
          }
        >
          Ajuste os filtros ou consulte o acervo completo.
        </Empty>
      )}
      {results.length > 24 && (
        <nav className="pagination" aria-label="Páginas de resultados">
          <button
            className="button"
            disabled={page === 0}
            onClick={() => {
              update({ page: page - 1 });
              list.current?.scrollIntoView({ block: "start" });
            }}
          >
            Resultados anteriores
          </button>
          <span>
            {page + 1} / {Math.ceil(results.length / 24)}
          </span>
          <button
            className="button"
            disabled={(page + 1) * 24 >= results.length}
            onClick={() => {
              update({ page: page + 1 });
              list.current?.scrollIntoView({ block: "start" });
            }}
          >
            Próximos resultados
          </button>
        </nav>
      )}
    </section>
  );
}
