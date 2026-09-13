import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { bookUrl } from "./book-source";

GlobalWorkerOptions.workerSrc = workerUrl;
type Cached = {
  task: PDFDocumentLoadingTask;
  listeners: Set<(progress: number) => void>;
  users: number;
  timer?: ReturnType<typeof setTimeout>;
};
let cached: Cached | undefined;

/** Reuse the parsed book during reference hopping; release idle workers after 90s. */
export function acquireBookDocument(onProgress: (progress: number) => void) {
  if (!cached) {
    const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href)
      .href;
    const task = getDocument({
      url: bookUrl,
      disableRange: true,
      disableStream: true,
      useSystemFonts: false,
      cMapUrl: `${assets}cmaps/`,
      standardFontDataUrl: `${assets}standard_fonts/`,
      wasmUrl: `${assets}wasm/`,
      iccUrl: `${assets}iccs/`,
    });
    const entry: Cached = { task, listeners: new Set(), users: 0 };
    task.onProgress = ({
      loaded,
      total,
    }: {
      loaded: number;
      total: number;
    }) => {
      if (total)
        entry.listeners.forEach((listener) =>
          listener(Math.min(100, Math.round((100 * loaded) / total))),
        );
    };
    void task.promise.catch(() => {
      if (cached === entry) cached = undefined;
      void task.destroy();
    });
    cached = entry;
  }
  const entry = cached;
  clearTimeout(entry.timer);
  entry.users++;
  entry.listeners.add(onProgress);
  return {
    promise: entry.task.promise,
    release: () => {
      entry.listeners.delete(onProgress);
      if (--entry.users === 0)
        entry.timer = setTimeout(() => {
          if (cached === entry) cached = undefined;
          void entry.task.destroy();
        }, 90_000);
    },
  };
}
