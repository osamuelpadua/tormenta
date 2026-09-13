import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ExternalLink,
} from "lucide-react";
import { Modal, SearchBox } from "./shared";
import type { BookBlock, BookPage } from "./book-types";
import { bookUrl, pdfPageNumber } from "./book-source";

const BookPdf = lazy(() => import("./book-pdf"));

const normalize = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

function BookContent({ block }: { block: BookBlock }) {
  if (block.type === "heading") {
    if (block.level === 1) return <h2 className="book-title">{block.text}</h2>;
    if (block.level === 2) return <h3>{block.text}</h3>;
    return <h4>{block.text}</h4>;
  }
  if (block.type === "table")
    return (
      <figure className="book-table">
        <figcaption>{block.caption}</figcaption>
        <p className="book-table-hint">
          Deslize a tabela para consultar todas as colunas.
        </p>
        <div
          className="book-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={block.caption}
        >
          <table aria-label={block.caption}>
            <thead>
              <tr>
                {block.headers.map((header) => (
                  <th key={header} scope="col">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) =>
                    index === 0 ? (
                      <th key={index} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={index}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="book-table-notes">
          {block.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </figure>
    );
  if (block.type === "lines")
    return <p className="book-extract">{block.text}</p>;
  return (
    <p>
      {block.lead ? (
        <>
          <strong>{block.lead}</strong>
          {block.text.slice(block.lead.length)}
        </>
      ) : (
        block.text
      )}
    </p>
  );
}

export function BookModal({
  page = 17,
  onClose,
}: {
  page?: number;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<BookPage[]>([]);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(page);
  const [pageInput, setPageInput] = useState(String(page));
  const [query, setQuery] = useState("");
  const [view, setView] = useState("pdf");
  const [zoom, setZoom] = useState(1);
  const [fontSize, setFontSize] = useState(18);
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import("../data/book-pages.json"),
      import("../data/book-layout.json"),
    ])
      .then(([raw, layout]) => {
        if (!cancelled)
          setPages(
            raw.default.map((p, index) => ({
              ...p,
              blocks: layout.default[index].blocks as BookBlock[],
            })),
          );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useLayoutEffect(() => {
    content.current
      ?.closest(".modal-body")
      ?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [current, view]);
  const searchPages = useMemo(
    () =>
      pages.map((p) => {
        const text = p.text.replace(/\s+/g, " ");
        return { ...p, text, normalized: normalize(text) };
      }),
    [pages],
  );
  const term = normalize(query.trim());
  const results =
    term.length >= 3
      ? searchPages.filter((p) => p.normalized.includes(term))
      : [];
  const selected = pages.find((p) => p.printed === current);
  const goTo = (number: number) => {
    setCurrent(number);
    setPageInput(String(number));
  };

  return (
    <Modal
      title="Livro de referência"
      subtitle="Tormenta20 · Jogo do Ano · 17/11/2023"
      wide
      className={`book-reader ${view === "pdf" ? "book-reader-pdf" : ""}`}
      onClose={onClose}
      toolbar={
        <div className="book-toolbar">
          <div className="book-search">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Buscar no livro (ao menos 3 caracteres)…"
            />
            {term.length >= 3 && (
              <div className="book-results">
                <small role="status">
                  {pages.length === 0
                    ? "Carregando o livro…"
                    : results.length === 0
                      ? "Nenhuma página encontrada."
                      : `${results.length} páginas encontradas${results.length > 30 ? " · exibindo as primeiras 30" : ""}`}
                </small>
                {results.slice(0, 30).map((p) => {
                  const at = p.normalized.indexOf(term);
                  const start = Math.max(0, at - 55);
                  return (
                    <button
                      key={p.page}
                      onClick={() => {
                        goTo(p.printed);
                        setQuery("");
                      }}
                    >
                      <b>p. {p.printed}</b>
                      <span>
                        {start > 0 && "…"}
                        {p.text.slice(start, at)}
                        <mark>{p.text.slice(at, at + term.length)}</mark>
                        {p.text.slice(at + term.length, at + term.length + 100)}
                        …
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="book-tools">
            <select
              className="book-view-select"
              aria-label="Visualização do livro"
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="pdf">PDF original</option>
              <option value="reading">Texto organizado</option>
              <option value="raw">Texto extraído</option>
            </select>
            {view === "pdf" ? (
              <>
                <div
                  className="book-pdf-zoom"
                  role="group"
                  aria-label="Zoom do PDF"
                >
                  <button
                    aria-label="Diminuir zoom"
                    disabled={zoom <= 0.75}
                    onClick={() => setZoom((value) => value - 0.25)}
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    aria-label="Ajustar à largura"
                    title="Ajustar à largura"
                    onClick={() => setZoom(1)}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    aria-label="Aumentar zoom"
                    disabled={zoom >= 3}
                    onClick={() => setZoom((value) => value + 0.25)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <a
                  className="book-open-pdf"
                  href={`${bookUrl}#page=${pdfPageNumber(current)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir PDF em outra aba"
                  title="Abrir PDF em outra aba"
                >
                  <ExternalLink size={16} />
                </a>
              </>
            ) : (
              <div
                className="book-font-controls"
                role="group"
                aria-label="Tamanho do texto"
              >
                <button
                  aria-label="Diminuir texto"
                  disabled={fontSize <= 16}
                  onClick={() => setFontSize((size) => size - 1)}
                >
                  <Minus size={13} />
                  <span>A</span>
                </button>
                <button
                  aria-label="Aumentar texto"
                  disabled={fontSize >= 22}
                  onClick={() => setFontSize((size) => size + 1)}
                >
                  <span>A</span>
                  <Plus size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      }
      footer={
        <>
          <button
            className="button"
            disabled={current <= -5}
            onClick={() => goTo(current - 1)}
          >
            <ChevronLeft size={16} />
            Anterior
          </button>
          <div className="page-control">
            <span>Página impressa</span>
            <input
              type="number"
              aria-label="Página do livro"
              value={pageInput}
              min={-5}
              max={401}
              onChange={(e) => {
                setPageInput(e.target.value);
                const number = Number(e.target.value);
                if (
                  e.target.value &&
                  Number.isInteger(number) &&
                  number >= -5 &&
                  number <= 401
                )
                  setCurrent(number);
              }}
              onBlur={() => setPageInput(String(current))}
            />
          </div>
          <button
            className="button"
            disabled={current >= 401}
            onClick={() => goTo(current + 1)}
          >
            Próxima
            <ChevronRight size={16} />
          </button>
        </>
      }
    >
      <article
        ref={content}
        className="book-page"
        style={{ "--book-font-size": `${fontSize}px` } as CSSProperties}
        aria-label={`Página ${current} do livro`}
      >
        <div className="book-page-meta">
          <span className="eyebrow">Página {current}</span>
          <span>PDF {current + 6}</span>
        </div>
        {view === "pdf" ? (
          <Suspense fallback={<p role="status">Carregando leitor PDF…</p>}>
            <BookPdf page={current} zoom={zoom} />
          </Suspense>
        ) : error ? (
          <p role="alert">
            Não foi possível carregar o livro. Feche e abra o leitor para tentar
            novamente.
          </p>
        ) : !selected ? (
          <p role="status">Carregando referência…</p>
        ) : view === "raw" ? (
          <p className="book-original">
            {selected.text || "Esta página não contém texto extraível."}
          </p>
        ) : selected.blocks.length ? (
          selected.blocks.map((block, index) => (
            <BookContent key={index} block={block} />
          ))
        ) : (
          <p>Esta página não contém texto extraível.</p>
        )}
      </article>
    </Modal>
  );
}
