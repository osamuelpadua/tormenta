import type { PreparedMapImage } from "../../domain/maps";
import { rasterizeImage } from "./image-processing";

export async function prepareMapImage(
  file: File,
  progress: (value: number) => void,
  signal: AbortSignal,
): Promise<PreparedMapImage> {
  signal.throwIfAborted();
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined")
    return rasterizeImage(file, progress, () => signal.aborted);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./image.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("Preparação cancelada.", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{
        progress?: number;
        image?: PreparedMapImage;
        error?: string;
      }>,
    ) => {
      if (event.data.progress !== undefined) progress(event.data.progress);
      if (event.data.image) {
        finish();
        resolve(event.data.image);
      }
      if (event.data.error) {
        finish();
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "Não foi possível preparar a imagem. Tente um arquivo menor.",
        ),
      );
    };
    worker.postMessage(file);
  });
}
