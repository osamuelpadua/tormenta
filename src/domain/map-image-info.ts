// Read dimensions before allocating a decoded bitmap, including in backup validation.
export function mapImageInfo(bytes: Uint8Array): {
  width: number;
  height: number;
  mime: string;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    ascii(1, 7) === "PNG\r\n\x1a\n" &&
    ascii(12, 4) === "IHDR"
  )
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
      mime: "image/png",
    };
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const kind = ascii(offset, 4),
        size = view.getUint32(offset + 4, true),
        data = offset + 8;
      if (data + size > bytes.length) break;
      if (
        kind === "VP8 " &&
        size >= 10 &&
        bytes[data + 3] === 157 &&
        bytes[data + 4] === 1 &&
        bytes[data + 5] === 42
      )
        return {
          width: view.getUint16(data + 6, true) & 16383,
          height: view.getUint16(data + 8, true) & 16383,
          mime: "image/webp",
        };
      if (kind === "VP8L" && size >= 5 && bytes[data] === 47) {
        const packed = view.getUint32(data + 1, true);
        return {
          width: (packed & 16383) + 1,
          height: ((packed >>> 14) & 16383) + 1,
          mime: "image/webp",
        };
      }
      if (kind === "VP8X" && size >= 10)
        return {
          width:
            1 +
            bytes[data + 4] +
            (bytes[data + 5] << 8) +
            (bytes[data + 6] << 16),
          height:
            1 +
            bytes[data + 7] +
            (bytes[data + 8] << 8) +
            (bytes[data + 9] << 16),
          mime: "image/webp",
        };
      offset = data + size + (size % 2);
    }
  }
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      if (offset + 3 > bytes.length) break;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      )
        return {
          width: view.getUint16(offset + 5),
          height: view.getUint16(offset + 3),
          mime: "image/jpeg",
        };
      offset += length;
    }
  }
  throw new Error("Imagem inválida. Use um arquivo JPEG, PNG ou WebP íntegro.");
}
