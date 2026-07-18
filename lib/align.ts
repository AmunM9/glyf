// Alineación recortes↔caracteres por programación dinámica (tipo alineamiento
// de secuencias): un rayón entre la 'a' y la 'b' se salta con costo en vez de
// correr toda la fila. El parecido usa la altura relativa esperada de cada
// clase de carácter (mayúscula/dígito ≈ 1, minúscula x-height ≈ 0.62,
// puntuación pequeña ≈ 0.3) frente a la altura real del recorte.
// ponytail: solo altura relativa; techo = confundir formas de igual altura;
// mejora = comparar también anchura o correlación de siluetas.
import { X_HEIGHT_CHARS } from './charset';
import type { Box } from './segment';

const SMALL = new Set(['.', ',', "'", '"', '-']);
const MID = new Set([':', ';']);

const SKIP_CROP = 0.5; // costo de ignorar un recorte (rayón, mota)
const SKIP_CHAR = 0.8; // costo de dejar un carácter sin recorte

function expectedH(char: string): number {
  if (SMALL.has(char)) return 0.3;
  if (MID.has(char)) return 0.7;
  if (X_HEIGHT_CHARS.has(char)) return 0.62;
  return 1.0; // mayúsculas, dígitos, ascendentes/descendentes, acentuadas, ¡¿!?()
}

// Devuelve, por cada recorte (ordenado por x), su carácter asignado o null.
export function alignRow(boxes: Box[], chars: string[]): (string | null)[] {
  const n = boxes.length;
  const m = chars.length;
  if (!n) return [];
  const heights = boxes.map((b) => b.h).sort((a, b) => a - b);
  const capH = heights[Math.min(n - 1, Math.floor(n * 0.85))] || 1;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i * SKIP_CROP;
  for (let j = 1; j <= m; j++) dp[0][j] = j * SKIP_CHAR;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = Math.abs(boxes[i - 1].h / capH - expectedH(chars[j - 1]));
      dp[i][j] = Math.min(
        dp[i - 1][j] + SKIP_CROP,
        dp[i][j - 1] + SKIP_CHAR,
        dp[i - 1][j - 1] + match,
      );
    }
  }
  // backtrack
  const out: (string | null)[] = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const match = Math.abs(boxes[i - 1].h / capH - expectedH(chars[j - 1]));
    if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + match)) < 1e-9) {
      out[i - 1] = chars[j - 1];
      i--;
      j--;
    } else if (Math.abs(dp[i][j] - (dp[i - 1][j] + SKIP_CROP)) < 1e-9) {
      i--;
    } else {
      j--;
    }
  }
  return out;
}
