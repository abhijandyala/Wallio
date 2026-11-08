/**
 * Draws a short random code as big block letters into a PNG, with no image
 * libraries. Used by the vision capability gate: the model passes only if it
 * reads back the exact code, which it cannot guess.
 */
import { crc32, deflateSync } from "node:zlib";
import { randomInt } from "node:crypto";

// 5×7 glyphs. Ambiguous characters (0/O, 1/I, 6/G, S/5 pairs) are left out on purpose.
const GLYPHS: Record<string, string[]> = {
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
};
const CHARS = Object.keys(GLYPHS);

export function randomMarker(length = 4): string {
  return Array.from({ length }, () => CHARS[randomInt(CHARS.length)]).join("");
}

export function markerPng(code: string, scale = 18): Buffer {
  const glyphW = 5, glyphH = 7, gap = 2, margin = 4;
  const cols = code.length * (glyphW + gap) - gap + margin * 2;
  const rows = glyphH + margin * 2;
  const w = cols * scale, h = rows * scale;

  const raw = Buffer.alloc((w + 1) * h, 0xff); // white, grayscale
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0; // filter byte: none

  [...code].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) throw new Error(`no glyph for ${ch}`);
    const ox = margin + i * (glyphW + gap);
    g.forEach((row, gy) =>
      [...row].forEach((bit, gx) => {
        if (bit !== "1") return;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const px = (ox + gx) * scale + dx, py = (margin + gy) * scale + dy;
            raw[py * (w + 1) + 1 + px] = 0x00;
          }
      }),
    );
  });

  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
