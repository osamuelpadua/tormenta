import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ExternalLink,
  Search,
  X,
  SlidersHorizontal,
  Check,
  ArrowRight,
} from "lucide-react";
import { Modal } from "./shared";
import { bookUrl, pdfPageNumber } from "./book-source";
import {
  bookMatches,
  bookPageLabel,
  FIRST_BOOK_PAGE,
  LAST_BOOK_PAGE,
  normalizeBookQuery,
  parseBookPage,
} from "./book-search";

const BookPdf = lazy(() => import("./book-pdf"));
type SearchPage = {
  page: number;
  printed: number;
  text: string;
  normalized: string;
};

export function BookModal({
  page = 17,
  onClose,
}: {
  page?: number;
  onClose: () => void;
}) {
  const initialPage = parseBookPage(String(page)) ?? 17;
  const [current, setCurrent] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [pageError, setPageError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [controls, setControls] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState("");
  const [matchRequest, setMatchRequest] = useState(0);
  const [pages, setPages] = useState<SearchPage[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [searchRetry, setSearchRetry] = useState(0);
  const [shown, setShown] = useState(24);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const term = normalizeBookQuery(query);

  useEffect(() => {
    if (!searchOpen || pages.length) return;
    let cancelled = false;
    setSearchState("loading");
    void import("../data/book-pages.json")
      .then((data) => {
        if (cancelled) return;
        setPages(
          data.default.map((p) => ({
            ...p,
            normalized: normalizeBookQuery(p.text),
          })),
        );
        setSearchState("ready");
      })
      .catch(() => {
        if (!cancelled) setSearchState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [searchOpen, searchRetry, pages.length]);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  const results = useMemo(
    () =>
      term.length < 3 ? [] : pages.filter((p) => p.normalized.includes(term)),
    [pages, term],
  );
  const goTo = useCallback((number: number, fromSearch = false) => {
    const next = Math.max(FIRST_BOOK_PAGE, Math.min(LAST_BOOK_PAGE, number));
    setCurrent(next);
    setPageInput(String(next));
    setPageError("");
    if (!fromSearch) setHighlight("");
  }, []);
  const changeZoom = useCallback(
    (value: number) => setZoom(Math.max(0.5, Math.min(4, value))),
    [],
  );
  const closeSearch = () => {
    setSearchOpen(false);
    searchButton.current?.focus();
  };
  const commitPage = () => {
    const next = parseBookPage(pageInput);
    if (next === undefined) {
      setPageError(
        `Informe uma página de ${FIRST_BOOK_PAGE} a ${LAST_BOOK_PAGE}.`,
      );
      return;
    }
    goTo(next);
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      // Search inputs consume Escape to clear their value before dialog cancel.
      if (event.key === "Escape" && (searchOpen || toolsOpen)) {
        event.preventDefault();
        setSearchOpen(false);
        setToolsOpen(false);
        searchButton.current?.focus();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (
        (event.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable=true]",
        ) ||
        searchOpen
      )
        return;
      if (event.key === "PageDown" || event.key === "PageUp") {
        event.preventDefault();
        goTo(current + (event.key === "PageDown" ? 1 : -1));
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeZoom(zoom + 0.25);
      } else if (event.key === "-") {
        event.preventDefault();
        changeZoom(zoom - 0.25);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [current, zoom, goTo, changeZoom, searchOpen, toolsOpen]);

  return (
    <Modal
      title="Livro de referência"
      wide
      onClose={onClose}
      className={`book-reader book-reader-pdf ${controls ? "" : "reader-controls-hidden"}`}
      onEscape={() =>
        searchOpen ? closeSearch() : toolsOpen ? setToolsOpen(false) : onClose()
      }
    >
      <div className="reader-stage" ref={viewport}>
        <article
          className="book-page"
          aria-label={`${bookPageLabel(current)} do livro`}
        >
          <Suspense
            fallback={
              <div className="book-pdf-message" role="status">
                Carregando leitor PDF…
              </div>
            }
          >
            <BookPdf
              page={current}
              zoom={zoom}
              highlight={highlight}
              matchRequest={matchRequest}
              onZoomChange={changeZoom}
              onPageChange={goTo}
            />
          </Suspense>
        </article>
        <button
          className="reader-search-toggle reader-float"
          aria-label="Pesquisar no livro"
          title="Pesquisar no livro (Ctrl+F)"
          aria-expanded={searchOpen}
          aria-controls="reader-search-panel"
          ref={searchButton}
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        >
          <Search size={19} />
          <span>Pesquisar</span>
        </button>
        <button
          className="reader-controls-toggle reader-float"
          aria-label={controls ? "Recolher controles" : "Mostrar controles"}
          title={controls ? "Recolher controles" : "Mostrar controles"}
          aria-expanded={controls}
          aria-controls="reader-controls"
          onClick={() => {
            setControls((value) => !value);
            setToolsOpen(false);
          }}
        >
          <SlidersHorizontal size={18} />
        </button>
        <div className="reader-dock" id="reader-controls" hidden={!controls}>
          {toolsOpen && (
            <div
              className="reader-tools"
              role="group"
              aria-label="Ferramentas de leitura"
            >
              <div
                className="book-pdf-zoom"
                role="group"
                aria-label="Zoom do PDF"
              >
                <button
                  aria-label="Diminuir zoom"
                  disabled={zoom <= 0.5}
                  onClick={() => changeZoom(zoom - 0.25)}
                >
                  <Minus size={17} />
                </button>
                <button
                  aria-label="Ajustar à largura"
                  title="Ajustar à largura"
                  onClick={() => changeZoom(1)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  aria-label="Aumentar zoom"
                  disabled={zoom >= 4}
                  onClick={() => changeZoom(zoom + 0.25)}
                >
                  <Plus size={17} />
                </button>
              </div>
              <a
                href={`${bookUrl}#page=${pdfPageNumber(current)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir PDF em outra aba"
                title="Abrir PDF em outra aba"
              >
                <ExternalLink size={18} />
              </a>
              <p>
                Dois dedos para ampliar. Arraste para ler.
                <br />
                PgUp/PgDn para mudar de página.
              </p>
            </div>
          )}
          <nav className="reader-pagination" aria-label="Navegação do livro">
            <button
              aria-label="Anterior"
              title="Página anterior"
              disabled={current <= FIRST_BOOK_PAGE}
              onClick={() => goTo(current - 1)}
            >
              <ChevronLeft size={21} />
            </button>
            <form
              className="reader-page-control"
              onSubmit={(event) => {
                event.preventDefault();
                commitPage();
              }}
            >
              <label className="sr-only" htmlFor="reader-page-input">
                Página do livro
              </label>
              <input
                id="reader-page-input"
                inputMode="numeric"
                type="text"
                value={pageInput}
                aria-invalid={!!pageError}
                aria-describedby={
                  pageError ? "reader-page-error" : "reader-page-help"
                }
                onChange={(event) => {
                  setPageInput(event.target.value);
                  setPageError("");
                }}
                onBlur={() => {
                  if (pageInput !== String(current)) commitPage();
                }}
              />
              <span aria-hidden="true">/ {LAST_BOOK_PAGE}</span>
              <span className="sr-only" id="reader-page-help">
                Página impressa. Enter para abrir. Capa e páginas iniciais: -5 a
                0.
              </span>
              <button
                type="submit"
                aria-label="Ir para a página"
                title="Ir para a página"
              >
                <Check size={15} />
              </button>
            </form>
            <button
              aria-label="Próxima"
              title="Próxima página"
              disabled={current >= LAST_BOOK_PAGE}
              onClick={() => goTo(current + 1)}
            >
              <ChevronRight size={21} />
            </button>
            <button
              aria-label="Zoom e opções"
              title="Zoom e opções"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((value) => !value)}
            >
              <Plus size={17} />
              <span className="reader-zoom-label">
                {Math.round(zoom * 100)}%
              </span>
            </button>
          </nav>
          {pageError && (
            <p
              className="reader-page-error"
              id="reader-page-error"
              role="alert"
            >
              {pageError}
            </p>
          )}
        </div>
        <span className="sr-only" role="status">
          {bookPageLabel(current)} · PDF {pdfPageNumber(current)} de{" "}
          {LAST_BOOK_PAGE + 6}
        </span>
        {searchOpen && (
          <section
            className="reader-search-panel"
            id="reader-search-panel"
            aria-label="Pesquisa no livro"
          >
            <div className="reader-search-heading">
              <h3>Pesquisar no livro</h3>
              <button aria-label="Fechar pesquisa" onClick={closeSearch}>
                <X size={19} />
              </button>
            </div>
            <div className="reader-search-input">
              <Search size={18} />
              <input
                ref={searchInput}
                value={query}
                aria-label="Buscar no livro"
                placeholder="Nome, regra ou trecho…"
                type="search"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShown(24);
                }}
              />
            </div>
            <p className="reader-search-status" role="status">
              {searchState === "error"
                ? "Não foi possível carregar a pesquisa."
                : searchState !== "ready"
                  ? "Preparando pesquisa…"
                  : term.length < 3
                    ? "Digite ao menos 3 caracteres. Acentos são opcionais."
                    : results.length
                      ? `${results.length} páginas encontradas`
                      : "Nenhuma página encontrada."}
            </p>
            {searchState === "error" && (
              <button
                className="button"
                onClick={() => setSearchRetry((value) => value + 1)}
              >
                Tentar novamente
              </button>
            )}
            <div className="book-results">
              {results.slice(0, shown).map((p) => {
                const match = bookMatches(p.text, query)[0];
                if (!match) return null;
                return (
                  <button
                    className="reader-result"
                    key={p.page}
                    onClick={() => {
                      goTo(p.printed, true);
                      setHighlight(query);
                      setMatchRequest((value) => value + 1);
                      setSearchOpen(false);
                      viewport.current
                        ?.querySelector<HTMLElement>(".book-pdf-scroll")
                        ?.focus();
                    }}
                  >
                    <b>
                      {bookPageLabel(p.printed)} <ArrowRight size={15} />
                    </b>
                    <span>
                      {match.start > 55 ? "…" : ""}
                      {p.text.slice(Math.max(0, match.start - 55), match.start)}
                      <mark>{p.text.slice(match.start, match.end)}</mark>
                      {p.text.slice(match.end, match.end + 115)}…
                    </span>
                  </button>
                );
              })}
              {results.length > shown && (
                <button
                  className="reader-more"
                  onClick={() => setShown((value) => value + 24)}
                >
                  Ver mais resultados ({results.length - shown})
                </button>
              )}
            </div>
            {highlight && (
              <button
                className="text-button reader-clear"
                onClick={() => setHighlight("")}
              >
                Limpar destaques da página
              </button>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
