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
import { bookMatches } from "./book-search";
import "./book-pdf.css";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function BookPdf({
  page,
  zoom,
  highlight,
  matchRequest,
  onZoomChange,
  onPageChange,
}: {
  page: number;
  zoom: number;
  highlight: string;
  matchRequest: number;
  onZoomChange: (zoom: number) => void;
  onPageChange: (page: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const displayedPage = useRef<number | undefined>(undefined);
  const focusedMatch = useRef(0);
  const zoomAnchor = useRef<{
    x: number;
    y: number;
    viewX: number;
    viewY: number;
  } | null>(null);
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
    observer.observe(scroller.current!);
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
      const scroll = scroller.current!;
      const previous = host.current?.firstElementChild as HTMLElement | null;
      const padding = parseFloat(getComputedStyle(scroll).paddingTop);
      const anchor =
        zoomAnchor.current ??
        (previous && displayedPage.current === page
          ? {
              x:
                (scroll.scrollLeft + scroll.clientWidth / 2) /
                previous.offsetWidth,
              y:
                (scroll.scrollTop + scroll.clientHeight / 2 - padding) /
                previous.offsetHeight,
              viewX: scroll.clientWidth / 2,
              viewY: scroll.clientHeight / 2,
            }
          : null);
      host.current?.replaceChildren(sheet);
      if (host.current) host.current.style.transform = "";
      if (anchor && displayedPage.current === page) {
        scroll.scrollTo({
          left: anchor.x * viewport.width - anchor.viewX,
          top: anchor.y * viewport.height - anchor.viewY + padding,
          behavior: "instant",
        });
      } else scroll.scrollTo({ top: 0, left: 0, behavior: "instant" });
      zoomAnchor.current = null;
      displayedPage.current = page;
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

  useEffect(() => {
    if (!ready || !host.current) return;
    const sheet = host.current.querySelector<HTMLElement>(".book-pdf-sheet");
    if (!sheet) return;
    sheet.querySelector(".book-pdf-highlights")?.remove();
    if (!highlight) return;
    const spans = [
      ...sheet.querySelectorAll<HTMLElement>(".book-pdf-text span"),
    ].filter((span) => span.firstChild?.nodeType === Node.TEXT_NODE);
    let text = "";
    const pieces = spans.map((span) => {
      const start = text.length;
      text += span.textContent + "\n";
      return { span, start, end: text.length - 1 };
    });
    const matches = bookMatches(text, highlight);
    const layer = window.document.createElement("div");
    layer.className = "book-pdf-highlights";
    layer.setAttribute("aria-hidden", "true");
    const bounds = sheet.getBoundingClientRect();
    for (const match of matches) {
      for (const piece of pieces.filter(
        (p) => p.end > match.start && p.start < match.end,
      )) {
        const range = window.document.createRange();
        range.setStart(
          piece.span.firstChild!,
          Math.max(0, match.start - piece.start),
        );
        range.setEnd(
          piece.span.firstChild!,
          Math.min(piece.end - piece.start, match.end - piece.start),
        );
        for (const rect of range.getClientRects()) {
          const mark = window.document.createElement("span");
          Object.assign(mark.style, {
            left: `${rect.left - bounds.left}px`,
            top: `${rect.top - bounds.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          });
          layer.append(mark);
        }
      }
    }
    sheet.append(layer);
    if (focusedMatch.current !== matchRequest) {
      focusedMatch.current = matchRequest;
      layer.firstElementChild?.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant",
      });
    }
  }, [highlight, matchRequest, ready, rendered]);

  useEffect(() => {
    const scroll = scroller.current!;
    let swipe: { x: number; y: number; at: number } | null = null;
    let pinch: { distance: number; zoom: number; next: number } | null = null;
    const distance = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
    const start = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        swipe = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          at: performance.now(),
        };
      } else if (event.touches.length === 2 && ready) {
        event.preventDefault();
        swipe = null;
        const sheet = host.current?.firstElementChild as HTMLElement | null;
        if (!sheet) return;
        const rect = scroll.getBoundingClientRect();
        const x =
          (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;
        const y =
          (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top;
        const padding = parseFloat(getComputedStyle(scroll).paddingTop);
        zoomAnchor.current = {
          x: (scroll.scrollLeft + x) / sheet.offsetWidth,
          y: (scroll.scrollTop + y - padding) / sheet.offsetHeight,
          viewX: x,
          viewY: y,
        };
        host.current!.style.transformOrigin = `${scroll.scrollLeft + x}px ${scroll.scrollTop + y - padding}px`;
        pinch = { distance: distance(event.touches), zoom, next: zoom };
      }
    };
    const move = (event: TouchEvent) => {
      if (!pinch || event.touches.length < 2) return;
      event.preventDefault();
      pinch.next = Math.max(
        0.5,
        Math.min(
          4,
          (pinch.zoom * distance(event.touches)) / Math.max(1, pinch.distance),
        ),
      );
      host.current!.style.transform = `scale(${pinch.next / pinch.zoom})`;
    };
    const end = (event: TouchEvent) => {
      if (pinch) {
        const next = Math.round(pinch.next * 100) / 100;
        pinch = null;
        swipe = null;
        if (next === zoom) {
          host.current!.style.transform = "";
          zoomAnchor.current = null;
        } else onZoomChange(next);
      } else if (
        swipe &&
        event.touches.length === 0 &&
        zoom <= 1 &&
        !window.getSelection()?.toString()
      ) {
        const touch = event.changedTouches[0];
        const dx = touch.clientX - swipe.x;
        const dy = touch.clientY - swipe.y;
        if (
          Math.abs(dx) > 75 &&
          Math.abs(dy) < 40 &&
          performance.now() - swipe.at < 550 &&
          swipe.x > 25 &&
          swipe.x < window.innerWidth - 25
        )
          onPageChange(page + (dx < 0 ? 1 : -1));
        swipe = null;
      }
    };
    const cancel = () => {
      pinch = null;
      swipe = null;
      zoomAnchor.current = null;
      if (host.current) host.current.style.transform = "";
    };
    scroll.addEventListener("touchstart", start, { passive: false });
    scroll.addEventListener("touchmove", move, { passive: false });
    scroll.addEventListener("touchend", end);
    scroll.addEventListener("touchcancel", cancel);
    return () => {
      scroll.removeEventListener("touchstart", start);
      scroll.removeEventListener("touchmove", move);
      scroll.removeEventListener("touchend", end);
      scroll.removeEventListener("touchcancel", cancel);
    };
  }, [zoom, page, ready, onZoomChange, onPageChange]);

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
        ref={scroller}
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
