import { rasterizeImage } from "./image-processing";
self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const image = await rasterizeImage(event.data, (value) =>
      self.postMessage({ progress: value }),
    );
    self.postMessage({ image });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível abrir a imagem.",
    });
  }
};
