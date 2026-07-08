// Segmentación: filas por proyección horizontal con escalera de umbrales,
// componentes conexos globales asignados a su fila por centroide (los
// descendentes no se truncan) y agrupado por solape en X (punto de la i,
// acentos, comillas).
import type { Binarized } from './preprocess';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SegRow {
  band: [number, number];
  boxes: Box[];
}

export class RowCountError extends Error {
  found: number;
  want: number;
  constructor(found: number, want: number) {
    super(`filas detectadas ${found} ≠ esperadas ${want}`);
    this.found = found;
    this.want = want;
  }
}

export class NoInkError extends Error {}

// turdsize: 0.2% del renglón (la cifra clásica) se come puntos y comas;
// 0.02% mata motas de pocos píxeles y conserva la puntuación pequeña.
const NOISE_AREA_FRACTION = 0.0002;
// escalera de umbrales: los valles entre filas apretadas tienen algo de tinta
// (descendentes que invaden el renglón siguiente); si el umbral base no separa
// las filas esperadas, se prueba con umbrales mayores.
const THRESHOLD_FRACTIONS = [0.002, 0.004, 0.008, 0.014, 0.024, 0.04, 0.06];

interface Run {
  y0: number;
  y1: number;
  ink: number;
}

interface Comp extends Box {
  area: number;
  cy: number; // centroide vertical de la tinta
}

export function segmentSheet(bin: Binarized, expectedCounts: number[]): SegRow[] {
  const bands = findRowBands(bin, expectedCounts.length);
  const comps = findComponents(bin);
  if (!comps.length) throw new NoInkError('sin tinta');

  const perRow: Comp[][] = bands.map(() => []);
  for (const c of comps) perRow[nearestBand(bands, c.cy)].push(c);

  const bandHeights = bands.map((b) => b[1] - b[0] + 1).sort((a, b) => a - b);
  const medBandH = bandHeights[bandHeights.length >> 1];

  return bands.map((band, i) => ({ band, boxes: groupRow(perRow[i], bin.width, medBandH) }));
}

// ---------- filas ----------

function findRowBands(bin: Binarized, expected: number): [number, number][] {
  const { mask, width, height } = bin;
  const proj = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0;
    const off = y * width;
    for (let x = 0; x < width; x++) s += mask[off + x];
    proj[y] = s;
  }
  // suavizado ventana 5 para no partir renglones por huecos de un trazo fino
  const smooth = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0;
    let n = 0;
    for (let k = -2; k <= 2; k++) {
      const yy = y + k;
      if (yy >= 0 && yy < height) {
        s += proj[yy];
        n++;
      }
    }
    smooth[y] = s / n;
  }

  let best: Run[] | null = null;
  let bestScore = Infinity;
  for (const f of THRESHOLD_FRACTIONS) {
    const runs = runsAtThreshold(proj, smooth, Math.max(1.5, width * f));
    if (!runs.length) continue;
    if (runs.length === expected) return toBands(runs, height);
    // prefiere pasarse (los sobrantes se descartan por tinta) a quedarse corto
    const score = runs.length > expected ? runs.length - expected : (expected - runs.length) * 3;
    if (score < bestScore) {
      bestScore = score;
      best = runs;
    }
  }
  if (!best) throw new NoInkError('sin tinta');

  const runs = best.slice();
  while (runs.length > expected) {
    let weakest = 0;
    for (let i = 1; i < runs.length; i++) if (runs[i].ink < runs[weakest].ink) weakest = i;
    runs.splice(weakest, 1);
  }
  // último recurso: divide el renglón más alto por su valle interno
  while (runs.length < expected) {
    const idx = tallestSplittable(runs, expected);
    if (idx < 0) throw new RowCountError(runs.length, expected);
    const pair = splitRun(runs[idx], proj, smooth);
    if (!pair) throw new RowCountError(runs.length, expected);
    runs.splice(idx, 1, ...pair);
    runs.sort((a, b) => a.y0 - b.y0);
  }
  return toBands(runs, height);
}

function runsAtThreshold(proj: Float64Array, smooth: Float64Array, thr: number): Run[] {
  const height = smooth.length;
  let runs: Run[] = [];
  let start = -1;
  for (let y = 0; y <= height; y++) {
    const on = y < height && smooth[y] > thr;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      let ink = 0;
      for (let yy = start; yy < y; yy++) ink += proj[yy];
      runs.push({ y0: start, y1: y - 1, ink });
      start = -1;
    }
  }
  if (!runs.length) return runs;

  // une renglones partidos por un gap pequeño (tildes separadas del cuerpo):
  // solo si uno de los dos es una tira baja (acentos), nunca dos filas completas
  const heights = runs.map((r) => r.y1 - r.y0 + 1).sort((a, b) => a - b);
  const medH = heights[heights.length >> 1];
  const merged: Run[] = [runs[0]];
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1];
    const gap = runs[i].y0 - prev.y1 - 1;
    const minH = Math.min(prev.y1 - prev.y0 + 1, runs[i].y1 - runs[i].y0 + 1);
    if (gap < medH * 0.4 && minH < medH * 0.45) {
      merged[merged.length - 1] = { y0: prev.y0, y1: runs[i].y1, ink: prev.ink + runs[i].ink };
    } else {
      merged.push(runs[i]);
    }
  }
  runs = merged;

  // descarta motas: renglones con muy poca tinta relativa
  const maxInk = Math.max(...runs.map((r) => r.ink));
  return runs.filter((r) => r.ink > maxInk * 0.02);
}

function tallestSplittable(runs: Run[], expected: number): number {
  // referencia = altura media que tendría cada fila esperada; funciona incluso
  // si todas las filas colapsaron en un solo renglón (la mediana no serviría)
  const totalH = runs.reduce((s, r) => s + r.y1 - r.y0 + 1, 0);
  let idx = -1;
  let tallest = (totalH / expected) * 1.4; // solo renglones anómalamente altos
  for (let i = 0; i < runs.length; i++) {
    const h = runs[i].y1 - runs[i].y0 + 1;
    if (h > tallest) {
      tallest = h;
      idx = i;
    }
  }
  return idx;
}

function splitRun(run: Run, proj: Float64Array, smooth: Float64Array): [Run, Run] | null {
  const h = run.y1 - run.y0 + 1;
  const from = run.y0 + Math.round(h * 0.25);
  const to = run.y1 - Math.round(h * 0.25);
  if (to - from < 2) return null;
  let cut = from;
  for (let y = from; y <= to; y++) if (smooth[y] < smooth[cut]) cut = y;
  const inkOf = (a: number, b: number) => {
    let s = 0;
    for (let y = a; y <= b; y++) s += proj[y];
    return s;
  };
  return [
    { y0: run.y0, y1: cut - 1, ink: inkOf(run.y0, cut - 1) },
    { y0: cut + 1, y1: run.y1, ink: inkOf(cut + 1, run.y1) },
  ];
}

function toBands(runs: Run[], height: number): [number, number][] {
  return runs.map((r) => [Math.max(0, r.y0 - 2), Math.min(height - 1, r.y1 + 2)]);
}

function nearestBand(bands: [number, number][], cy: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < bands.length; i++) {
    const [y0, y1] = bands[i];
    const d = cy < y0 ? y0 - cy : cy > y1 ? cy - y1 : 0;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ---------- componentes ----------

function findComponents(bin: Binarized): Comp[] {
  const { mask, width, height } = bin;
  const visited = new Uint8Array(width * height);
  const comps: Comp[] = [];
  const stack: number[] = [];

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;
    let minX = i % width;
    let maxX = minX;
    let minY = (i - minX) / width;
    let maxY = minY;
    let area = 0;
    let ySum = 0;
    stack.length = 0;
    stack.push(i);
    visited[i] = 1;
    while (stack.length) {
      const cur = stack.pop() as number;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      area++;
      ySum += cy;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      // vecinos 4-conexos sin cruzar los bordes laterales
      if (cx > 0 && mask[cur - 1] && !visited[cur - 1]) {
        visited[cur - 1] = 1;
        stack.push(cur - 1);
      }
      if (cx < width - 1 && mask[cur + 1] && !visited[cur + 1]) {
        visited[cur + 1] = 1;
        stack.push(cur + 1);
      }
      if (cy > 0 && mask[cur - width] && !visited[cur - width]) {
        visited[cur - width] = 1;
        stack.push(cur - width);
      }
      if (cy < height - 1 && mask[cur + width] && !visited[cur + width]) {
        visited[cur + width] = 1;
        stack.push(cur + width);
      }
    }
    comps.push({
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      area,
      cy: ySum / area,
    });
  }
  return comps;
}

function groupRow(comps: Comp[], width: number, medBandH: number): Box[] {
  const minArea = Math.max(9, NOISE_AREA_FRACTION * width * medBandH);
  const clean = comps.filter((c) => c.area >= minArea);
  clean.sort((a, b) => a.x - b.x);

  // agrupa componentes que se solapan en X: punto de la i, tildes, diéresis,
  // ¿ ¡ y los dos trazos de las comillas (gap proporcional a la altura del renglón)
  const mergeGap = Math.max(2, Math.round(medBandH * 0.1));
  const boxes: Box[] = [];
  for (const c of clean) {
    const last = boxes[boxes.length - 1];
    // ponytail: agrupado solo por intervalo X; techo = letras vecinas casi
    // pegadas; mejora = comparar solape proporcional al ancho de cada caja.
    if (last && c.x <= last.x + last.w + mergeGap) {
      boxes[boxes.length - 1] = unionBox(last, c);
    } else {
      boxes.push({ x: c.x, y: c.y, w: c.w, h: c.h });
    }
  }
  return boxes;
}

export function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

// Divide un recorte en dos por la columna con menos tinta del tramo central.
export function splitBox(bin: Binarized, box: Box): [Box, Box] | null {
  const { mask, width } = bin;
  if (box.w < 6) return null;
  const proj = new Float64Array(box.w);
  for (let dx = 0; dx < box.w; dx++) {
    let s = 0;
    for (let dy = 0; dy < box.h; dy++) s += mask[(box.y + dy) * width + box.x + dx];
    proj[dx] = s;
  }
  const from = Math.max(1, Math.round(box.w * 0.2));
  const to = Math.min(box.w - 2, Math.round(box.w * 0.8));
  let cut = from;
  for (let dx = from; dx <= to; dx++) if (proj[dx] < proj[cut]) cut = dx;
  const left = tightenBox(bin, { x: box.x, y: box.y, w: cut, h: box.h });
  const right = tightenBox(bin, { x: box.x + cut, y: box.y, w: box.w - cut, h: box.h });
  if (!left || !right) return null;
  return [left, right];
}

// Recorta filas/columnas vacías del borde de una caja; null si quedó sin tinta.
export function tightenBox(bin: Binarized, box: Box): Box | null {
  const { mask, width } = bin;
  let minX = box.x + box.w;
  let maxX = box.x - 1;
  let minY = box.y + box.h;
  let maxY = box.y - 1;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (mask[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
