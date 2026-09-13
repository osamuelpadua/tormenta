import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { bookUrl, pdfPageNumber } from "./book-source";
import "./book-pdf.css";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function BookPdf({
  page,
  zoom,
}: {
  page: number;
  zoom: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [rendered, setRendered] = useState("");
  const [renderError, setRenderError] = useState("");
  const renderKey = `${page}:${width}:${zoom}:${retry}`;
  const ready = rendered === renderKey;

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(frame.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDocument(undefined);
    setProgress(0);
    setLoadError(false);
    const assets = new URL(
      `${import.meta.env.BASE_URL}pdfjs/`,
      window.location.href,
    ).href;
    const task = getDocument({
      url: bookUrl,
      // Full responses work with the precached PDF, including offline reloads.
      disableRange: true,
      disableStream: true,
      useSystemFonts: false,
      cMapUrl: `${assets}cmaps/`,
      standardFontDataUrl: `${assets}standard_fonts/`,
      wasmUrl: `${assets}wasm/`,
      iccUrl: `${assets}iccs/`,
    });
    task.onProgress = ({
      loaded,
      total,
    }: {
      loaded: number;
      total: number;
    }) => {
      if (!cancelled && total > 0)
        setProgress(Math.min(100, Math.round((loaded * 100) / total)));
    };
    void task.promise
      .then((pdf) => {
        if (!cancelled) setDocument(pdf);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [retry]);

  useEffect(() => {
    if (!document || !width) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    let pdfPage: PDFPageProxy | undefined;
    setRenderError("");
    const render = async () => {
      pdfPage = await document.getPage(pdfPageNumber(page));
      if (cancelled) return;
      const original = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({
        scale: (width * zoom) / original.width,
      });
      // Each render owns its canvas: a cancelled page/zoom change cannot paint
      // into the next page or reuse a canvas while PDF.js is still drawing.
      const sheet = window.document.createElement("div");
      sheet.className = "book-pdf-sheet";
      sheet.style.width = `${viewport.width}px`;
      sheet.style.height = `${viewport.height}px`;
      sheet.style.setProperty(
        "--total-scale-factor",
        String(viewport.scale * viewport.userUnit),
      );
      const canvas = window.document.createElement("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        `Página ${page} do livro original · PDF ${pdfPageNumber(page)}`,
      );
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(8_000_000 / (viewport.width * viewport.height)),
      );
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const text = window.document.createElement("div");
      text.className = "book-pdf-text";
      sheet.append(canvas, text);
      renderTask = pdfPage.render({
        canvas,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      await renderTask.promise;
      if (cancelled) return;
      textLayer = new TextLayer({
        container: text,
        viewport,
        textContentSource: pdfPage.streamTextContent(),
      });
      await textLayer.render();
      if (cancelled) return;
      host.current?.replaceChildren(sheet);
      setRendered(renderKey);
    };
    void render().catch(() => {
      if (!cancelled) setRenderError(renderKey);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      // Page cleanup waits for an active render, and frees decoded images.
      pdfPage?.cleanup();
    };
  }, [document, page, width, zoom, renderKey]);

  const error = loadError || renderError === renderKey;
  return (
    <div className="book-pdf" ref={frame}>
      {error ? (
        <div className="book-pdf-message" role="alert">
          <p>Não foi possível exibir o PDF.</p>
          <button
            className="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Tentar novamente
          </button>
          <a
            className="button"
            href={`${bookUrl}#page=${pdfPageNumber(page)}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir o arquivo original
          </a>
        </div>
      ) : (
        !ready && (
          <div className="book-pdf-message" role="status">
            {document
              ? "Preparando página…"
              : `Carregando livro original${progress > 0 ? ` · ${progress}%` : "…"}`}
          </div>
        )
      )}
      <div
        className="book-pdf-scroll"
        tabIndex={0}
        role="region"
        aria-label="Página do PDF; use as setas para rolar"
        aria-busy={!ready && !error}
      >
        <div
          ref={host}
          className="book-pdf-host"
          aria-hidden={!ready || error}
          // Keep the previous page's space while its replacement is drawn.
          // Removing it from layout toggles the scrollbar and retriggers resize.
          style={{ visibility: !ready || error ? "hidden" : undefined }}
        />
      </div>
    </div>
  );
}
