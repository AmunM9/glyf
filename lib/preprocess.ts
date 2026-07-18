// Preproceso de la foto: EXIF → downscale → grises → contraste → umbral → deskew.
// Solo navegador (canvas); los helpers puros están exportados para self-checks.

export interface Binarized {
  mask: Uint8Array; // 1 = tinta, 0 = papel
  width: number;
  height: number;
}

// ponytail: límite de memoria en móvil (Safari iOS); más resolución no mejora el trazado.
const MAX_SIDE = 2000;
const MIN_SKEW_DEG = 0.3;

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Normaliza la orientación EXIF de fotos de celular.
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // ponytail: fallback sin EXIF para navegadores viejos; techo = fotos giradas
    // en Safari <15; mejora = parsear EXIF a mano con exifr.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('imagen ilegible'));
        img.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function preprocess(blob: Blob): Promise<Binarized> {
  const src = await loadBitmap(blob);
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height;
  if (!sw || !sh) throw new Error('imagen vacía');

  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas no disponible');
  ctx.drawImage(src, 0, 0, w, h);
  if ('close' in src) src.close();

  const { data } = ctx.getImageData(0, 0, w, h);
  let gray: Uint8ClampedArray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }

  // escaneo de documento: recorta al papel y endereza la perspectiva, para que
  // la mesa, el esfero u otros objetos alrededor no contaminen la segmentación
  const paper = extractPaper(gray, w, h);
  gray = paper.gray;
  let pw = paper.width;
  let ph = paper.height;

  stretchContrast(gray);
  let mask = binarize(gray, pw, ph);

  // orientación mal etiquetada por el giroscopio (EXIF incorrecto): se corrige
  // sola usando la estructura de la cartilla
  const fixed = fixOrientation(gray, mask, pw, ph);
  gray = fixed.gray;
  mask = fixed.mask;
  pw = fixed.width;
  ph = fixed.height;

  // las rayas del papel son paralelas al texto: ayudan al deskew, se quitan después
  const angle = estimateSkew(mask, pw, ph);
  if (process.env.NODE_ENV !== 'production') console.debug('[glyf] skew estimado:', angle);
  if (Math.abs(angle) >= MIN_SKEW_DEG) {
    rotateGray(gray, pw, ph, angle);
    mask = binarize(gray, pw, ph);
  }
  removeGridLines(mask, pw, ph);
  return { mask, width: pw, height: ph };
}

// ---------- orientación automática ----------
// Corrige fotos giradas 90/180/270° cuando el EXIF vino mal etiquetado.
// Dos señales de la propia cartilla:
// 1) Eje: las filas de texto forman bandas horizontales; si la tinta se
//    concentra más por columnas que por filas, la foto está de lado → 90°.
// 2) Sentido: la cartilla es "pesada arriba" (4 filas densas de letras arriba;
//    dígitos, puntuación y acentos, ligeros, abajo); si el centroide de tinta
//    cae en la mitad inferior del bloque, está al revés → 180°.
// Umbrales conservadores: ante señal ambigua NO se toca la imagen.
// ponytail: techo = cartillas incompletas o con dibujos extra que inviertan el
// peso; mejora = clasificar ascendentes vs descendentes por renglón.

interface Oriented {
  gray: Uint8ClampedArray;
  mask: Uint8Array;
  width: number;
  height: number;
}

const AXIS_RATIO = 1.15; // score columnas/filas para decidir "de lado"

export function fixOrientation(
  gray: Uint8ClampedArray,
  mask: Uint8Array,
  w: number,
  h: number,
): Oriented {
  // score de eje: concentración en bandas × fracción de valles vacíos dentro
  // del bloque de tinta (los renglones dejan valles a ~cero; las columnas de
  // letras de distintas filas casi nunca)
  const axisScore = (proj: Float64Array): number => {
    let total = 0;
    let max = 0;
    for (let i = 0; i < proj.length; i++) {
      total += proj[i];
      if (proj[i] > max) max = proj[i];
    }
    if (total < 50) return 0;
    let sq = 0;
    let a0 = -1;
    let a1 = -1;
    for (let i = 0; i < proj.length; i++) {
      sq += (proj[i] / total) * (proj[i] / total);
      if (proj[i] > max * 0.02) {
        if (a0 < 0) a0 = i;
        a1 = i;
      }
    }
    let zeros = 0;
    for (let i = a0; i <= a1; i++) if (proj[i] <= max * 0.02) zeros++;
    const zeroFrac = a1 > a0 ? zeros / (a1 - a0 + 1) : 0;
    return sq * proj.length * (1 + 2 * zeroFrac);
  };

  const projections = (m: Uint8Array, mw: number, mh: number) => {
    const rows = new Float64Array(mh);
    const cols = new Float64Array(mw);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (m[y * mw + x]) {
          rows[y]++;
          cols[x]++;
        }
      }
    }
    return { rows, cols };
  };

  let out: Oriented = { gray, mask, width: w, height: h };
  const initial = projections(mask, w, h);
  const cols = initial.cols;
  let rows = initial.rows;

  if (axisScore(cols) > axisScore(rows) * AXIS_RATIO) {
    out = {
      gray: rotateQuarter(out.gray, out.width, out.height),
      mask: rotateQuarter(out.mask, out.width, out.height),
      width: out.height,
      height: out.width,
    };
    rows = projections(out.mask, out.width, out.height).rows;
  }

  // sentido: la cartilla es pesada arriba. Se comparan las BANDAS de texto
  // (tinta media de la primera mitad de renglones vs la última) — mucho más
  // robusto en fotos reales que el centroide crudo por píxel.
  let maxRow = 0;
  for (let y = 0; y < rows.length; y++) if (rows[y] > maxRow) maxRow = rows[y];
  const thr = maxRow * 0.05;
  const bands: number[] = [];
  let acc = -1;
  for (let y = 0; y <= rows.length; y++) {
    const on = y < rows.length && rows[y] > thr;
    if (on) acc = (acc < 0 ? 0 : acc) + rows[y];
    else if (acc >= 0) {
      bands.push(acc);
      acc = -1;
    }
  }
  let flip = false;
  if (bands.length >= 3) {
    const half = Math.floor(bands.length / 2);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    flip = mean(bands.slice(-half)) > mean(bands.slice(0, half)) * 1.2;
  } else {
    // pocas bandas: centroide como respaldo
    let total = 0;
    let weighted = 0;
    let y0 = -1;
    let y1 = -1;
    for (let y = 0; y < rows.length; y++) {
      if (rows[y] > 0) {
        if (y0 < 0) y0 = y;
        y1 = y;
        total += rows[y];
        weighted += y * rows[y];
      }
    }
    flip = total > 50 && y1 - y0 > 10 && (weighted / total - y0) / (y1 - y0) > 0.55;
  }
  if (flip) {
    out = {
      gray: rotateHalf(out.gray, out.width, out.height),
      mask: rotateHalf(out.mask, out.width, out.height),
      width: out.width,
      height: out.height,
    };
  }
  if (process.env.NODE_ENV !== 'production' && out.width !== w) {
    console.debug('[glyf] orientación corregida');
  }
  return out;
}

// rotación 90° horaria: la imagen h×w resultante es exacta (sin pérdida)
function rotateQuarter<T extends Uint8Array | Uint8ClampedArray>(src: T, w: number, h: number): T {
  const Ctor = src.constructor as new (n: number) => T;
  const dst = new Ctor(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      dst[x * h + (h - 1 - y)] = src[y * w + x];
    }
  }
  return dst;
}

function rotateHalf<T extends Uint8Array | Uint8ClampedArray>(src: T, w: number, h: number): T {
  const Ctor = src.constructor as new (n: number) => T;
  const dst = new Ctor(w * h);
  for (let i = 0; i < src.length; i++) dst[src.length - 1 - i] = src[i];
  return dst;
}

// ---------- detección del papel (escáner de documentos) ----------
// Pipeline clásico de escaneo: reduce la imagen, segmenta el papel (la región
// clara mayor), extrae sus 4 esquinas y lo endereza con una homografía DLT de
// 4 puntos. Si no hay un papel detectable con confianza (el papel llena la
// foto, o la mesa es tan clara como el papel), devuelve la imagen intacta:
// nunca empeora lo que ya funcionaba.
// ponytail: segmentación por brillo en vez de Canny+contornos; techo = papel
// sobre mesa igual de blanca (cae al comportamiento anterior); mejora =
// detección de bordes + Hough si aparecen esos casos.

export interface GrayImage {
  gray: Uint8ClampedArray;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const PAPER_DETECT_SIDE = 400;
const PAPER_MIN_AREA = 0.2; // el papel debe ocupar ≥20% de la foto
const PAPER_FULL_FRAME = 0.93; // sobre esto, el papel ES la foto: no recortar
const PAPER_SOLIDITY = 0.65; // área del componente / área del cuadrilátero
const PAPER_INSET = 0.015; // recorte del borde del papel (sombra/canto)

export function extractPaper(gray: Uint8ClampedArray, w: number, h: number): GrayImage {
  const original: GrayImage = { gray, width: w, height: h };

  // 1) versión reducida para detectar rápido
  const s = Math.max(1, Math.ceil(Math.max(w, h) / PAPER_DETECT_SIDE));
  const sw = Math.floor(w / s);
  const sh = Math.floor(h / s);
  if (sw < 20 || sh < 20) return original;
  const small = new Uint8ClampedArray(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) small[y * sw + x] = gray[y * s * w + x * s];
  }

  // 2) el papel = mayor componente conexo claro
  const t = otsu(small);
  const bright = new Uint8Array(sw * sh);
  for (let i = 0; i < small.length; i++) if (small[i] > t) bright[i] = 1;
  const comp = largestBrightComponent(bright, sw, sh);
  if (!comp || comp.area < PAPER_MIN_AREA * sw * sh) return original;

  // 3) esquinas extremas del componente (TL, TR, BR, BL)
  const { tl, tr, br, bl } = comp;
  const quadArea =
    Math.abs(
      tl.x * tr.y - tr.x * tl.y +
        tr.x * br.y - br.x * tr.y +
        br.x * bl.y - bl.x * br.y +
        bl.x * tl.y - tl.x * bl.y,
    ) / 2;
  if (quadArea < PAPER_MIN_AREA * sw * sh) return original;
  if (comp.area / quadArea < PAPER_SOLIDITY) return original; // no es un rectángulo sólido
  if (quadArea > PAPER_FULL_FRAME * sw * sh) return original; // el papel llena la foto

  // 4) esquinas a resolución completa y tamaño destino
  const S = (p: Point): Point => ({ x: p.x * s, y: p.y * s });
  const [TL, TR, BR, BL] = [S(tl), S(tr), S(br), S(bl)];
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const outW = Math.round((dist(TL, TR) + dist(BL, BR)) / 2);
  const outH = Math.round((dist(TL, BL) + dist(TR, BR)) / 2);
  if (outW < 80 || outH < 80) return original;

  // 5) homografía destino→origen y remuestreo bilineal
  const H = homography(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    [TL, TR, BR, BL],
  );
  if (!H) return original;
  const out = new Uint8ClampedArray(outW * outH).fill(255);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const d = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / d;
      const sy = (H[3] * x + H[4] * y + H[5]) / d;
      if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = gray[y0 * w + x0];
      const i10 = gray[y0 * w + x0 + 1];
      const i01 = gray[(y0 + 1) * w + x0];
      const i11 = gray[(y0 + 1) * w + x0 + 1];
      out[y * outW + x] =
        i00 * (1 - fx) * (1 - fy) + i10 * fx * (1 - fy) + i01 * (1 - fx) * fy + i11 * fx * fy;
    }
  }

  // 6) recorta el canto del papel (sombra del borde)
  const ix = Math.round(outW * PAPER_INSET);
  const iy = Math.round(outH * PAPER_INSET);
  const cw = outW - ix * 2;
  const ch = outH - iy * 2;
  if (cw < 60 || ch < 60) return { gray: out, width: outW, height: outH };
  const cropped = new Uint8ClampedArray(cw * ch);
  for (let y = 0; y < ch; y++) {
    cropped.set(out.subarray((y + iy) * outW + ix, (y + iy) * outW + ix + cw), y * cw);
  }
  return { gray: cropped, width: cw, height: ch };
}

interface PaperComponent {
  area: number;
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

function largestBrightComponent(bright: Uint8Array, w: number, h: number): PaperComponent | null {
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  let best: PaperComponent | null = null;
  for (let i = 0; i < bright.length; i++) {
    if (!bright[i] || visited[i]) continue;
    let area = 0;
    // esquinas por extremos de x+y y x−y (cuadrilátero convexo del papel)
    let minSum = Infinity;
    let maxSum = -Infinity;
    let minDiff = Infinity;
    let maxDiff = -Infinity;
    const tl = { x: 0, y: 0 };
    const tr = { x: 0, y: 0 };
    const br = { x: 0, y: 0 };
    const bl = { x: 0, y: 0 };
    stack.length = 0;
    stack.push(i);
    visited[i] = 1;
    while (stack.length) {
      const cur = stack.pop() as number;
      const cx = cur % w;
      const cy = (cur - cx) / w;
      area++;
      const sum = cx + cy;
      const diff = cx - cy;
      if (sum < minSum) {
        minSum = sum;
        tl.x = cx;
        tl.y = cy;
      }
      if (sum > maxSum) {
        maxSum = sum;
        br.x = cx;
        br.y = cy;
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        tr.x = cx;
        tr.y = cy;
      }
      if (diff < minDiff) {
        minDiff = diff;
        bl.x = cx;
        bl.y = cy;
      }
      if (cx > 0 && bright[cur - 1] && !visited[cur - 1]) {
        visited[cur - 1] = 1;
        stack.push(cur - 1);
      }
      if (cx < w - 1 && bright[cur + 1] && !visited[cur + 1]) {
        visited[cur + 1] = 1;
        stack.push(cur + 1);
      }
      if (cy > 0 && bright[cur - w] && !visited[cur - w]) {
        visited[cur - w] = 1;
        stack.push(cur - w);
      }
      if (cy < h - 1 && bright[cur + w] && !visited[cur + w]) {
        visited[cur + w] = 1;
        stack.push(cur + w);
      }
    }
    if (!best || area > best.area) best = { area, tl: { ...tl }, tr: { ...tr }, br: { ...br }, bl: { ...bl } };
  }
  return best;
}

// Homografía DLT de 4 puntos: resuelve H (3x3, h33=1) tal que H·from ≈ to.
// Devuelve [a,b,c,d,e,f,g,h] con u=(ax+by+c)/(gx+hy+1), v=(dx+ey+f)/(gx+hy+1).
export function homography(from: Point[], to: Point[]): number[] | null {
  // sistema 8x8: dos ecuaciones por par de puntos
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  return solveLinear(A, b);
}

// eliminación gaussiana con pivoteo parcial
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-10) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

// Papel rayado o cuadriculado: las rayas se binarizan como tinta, puentean
// renglones y sueldan letras vecinas en un solo componente. Se eliminan por
// grosor: un píxel es "de línea" si su grosor perpendicular es ≤ LINE_THICKNESS
// (las rayas impresas son finas; el lapicero es más grueso) y forma parte de
// una estructura larga que cruza buena parte de la página. En la intersección
// raya×letra el grosor es mayor (trazo + raya), así que esos píxeles NO se
// borran y la letra no se parte. Tolera líneas onduladas: los segmentos finos
// encadenados siguen conectados aunque la raya driftee de fila.
// ponytail: techo = rayas tan gruesas como el lapicero o tinta muy fina tipo
// lápiz duro; mejora = umbral de grosor adaptativo por histograma de grosores.
const LINE_THICKNESS = 4;

export function removeGridLines(mask: Uint8Array, w: number, h: number): void {
  eraseThinLines(mask, w, h, true); // rayas horizontales
  eraseThinLines(mask, w, h, false); // líneas verticales de cuadrícula
}

function eraseThinLines(mask: Uint8Array, w: number, h: number, horizontal: boolean): void {
  const size = w * h;
  // 1) delgadez perpendicular: run de tinta ≤ LINE_THICKNESS en el eje contrario
  const thin = new Uint8Array(size);
  const outerLen = horizontal ? w : h; // recorre columnas (h) / filas (v)
  const innerLen = horizontal ? h : w; // mide el grosor
  const idxOf = horizontal
    ? (outer: number, inner: number) => inner * w + outer
    : (outer: number, inner: number) => outer * w + inner;
  for (let o = 0; o < outerLen; o++) {
    let start = -1;
    for (let i = 0; i <= innerLen; i++) {
      const on = i < innerLen && mask[idxOf(o, i)] === 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (i - start <= LINE_THICKNESS) {
          for (let k = start; k < i; k++) thin[idxOf(o, k)] = 1;
        }
        start = -1;
      }
    }
  }

  // 2) candidatos: segmentos de píxeles finos a lo largo del eje de la línea
  const alongLen = horizontal ? w : h;
  const acrossLen = horizontal ? h : w;
  const idxAlong = horizontal
    ? (across: number, along: number) => across * w + along
    : (across: number, along: number) => along * w + across;
  const minSeg = Math.max(30, Math.round(alongLen * 0.02));
  const cand = new Uint8Array(size);
  for (let a = 0; a < acrossLen; a++) {
    let start = -1;
    for (let l = 0; l <= alongLen; l++) {
      const on = l < alongLen && thin[idxAlong(a, l)] === 1;
      if (on && start < 0) start = l;
      if (!on && start >= 0) {
        if (l - start >= minSeg) {
          for (let k = start; k < l; k++) cand[idxAlong(a, k)] = 1;
        }
        start = -1;
      }
    }
  }

  // 3) una raya real acumula mucha tinta fina a lo largo de su fila/columna
  // (±1 px de ondulación), aunque las letras y los cruces la troceen. Las
  // barras cortas de una t o una E no llegan ni de lejos al 25% de la página.
  const minLineInk = Math.round(alongLen * 0.25);
  const perAcross = new Float64Array(acrossLen);
  for (let a = 0; a < acrossLen; a++) {
    let s = 0;
    for (let l = 0; l < alongLen; l++) s += cand[idxAlong(a, l)];
    perAcross[a] = s;
  }
  for (let a = 0; a < acrossLen; a++) {
    const windowInk =
      perAcross[a] + (a > 0 ? perAcross[a - 1] : 0) + (a < acrossLen - 1 ? perAcross[a + 1] : 0);
    if (windowInk < minLineInk) continue;
    // fila/columna confirmada como raya: se borra TODO píxel fino en ella,
    // incluidos los tocones cortos de los bordes y los restos de cruces
    // (que la otra pasada dejó adelgazados). Lo grueso —el trazo de una
    // letra que la cruza— sobrevive.
    for (let l = 0; l < alongLen; l++) {
      const p = idxAlong(a, l);
      if (thin[p]) mask[p] = 0;
    }
  }
}

// Estira el histograma al rango 0–255 recortando 0.5% en cada extremo
// (recupera trazos de lápiz claro antes de umbralizar).
export function stretchContrast(gray: Uint8ClampedArray): void {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const clip = gray.length * 0.005;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < clip; ) lo++;
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < clip; ) hi--;
  if (hi <= lo) return;
  const scale = 255 / (hi - lo);
  for (let i = 0; i < gray.length; i++) gray[i] = (gray[i] - lo) * scale;
}

export function otsu(gray: Uint8ClampedArray): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 127;
  let maxVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      best = t;
    }
  }
  return best;
}

function binarize(gray: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const t = otsu(gray);
  const mask = new Uint8Array(w * h);
  let ink = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] <= t) {
      mask[i] = 1;
      ink++;
    }
  }
  // Iluminación despareja: si Otsu global dejó regiones enteras negras
  // (sombra) cae al umbral adaptativo por media local.
  if (ink / gray.length > 0.25 || hasSolidBlocks(mask, w, h)) {
    // ponytail: media local con ventana 31px; techo = sombra muy dura; mejora = Sauvola.
    return adaptiveThreshold(gray, w, h);
  }
  return mask;
}

function hasSolidBlocks(mask: Uint8Array, w: number, h: number): boolean {
  const B = 64;
  let solid = 0;
  let total = 0;
  for (let by = 0; by < h; by += B) {
    for (let bx = 0; bx < w; bx += B) {
      const y1 = Math.min(by + B, h);
      const x1 = Math.min(bx + B, w);
      let ink = 0;
      for (let y = by; y < y1; y++) {
        for (let x = bx; x < x1; x++) ink += mask[y * w + x];
      }
      total++;
      if (ink / ((y1 - by) * (x1 - bx)) > 0.55) solid++;
    }
  }
  return solid / total > 0.06;
}

export function adaptiveThreshold(gray: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const R = 15; // ventana ~31px
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - R);
    const y1 = Math.min(h - 1, y + R);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R);
      const x1 = Math.min(w - 1, x + R);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      if (gray[y * w + x] < (sum / area) * 0.85) mask[y * w + x] = 1;
    }
  }
  return mask;
}

// Estima el ángulo dominante del texto (grados). Proyección por cizalla:
// para el ángulo correcto, r = y − x·tan(a) concentra la tinta en pocas filas
// y maximiza la suma de cuadrados del perfil.
export function estimateSkew(mask: Uint8Array, w: number, h: number): number {
  const xs: number[] = [];
  const ys: number[] = [];
  // muestrea columnas salteadas pero TODAS las filas: un paso en y produce
  // aliasing (la tinta cae solo en bins múltiplos del paso y el score de 0°
  // queda inflado artificialmente frente al ángulo real)
  const step = Math.max(1, Math.round((w * h) / 4_000_000) + 3);
  for (let x = 0; x < w; x += step) {
    for (let y = 0; y < h; y++) {
      if (mask[y * w + x]) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < 100) return 0;
  const offset = Math.ceil(w * 0.15); // |x·tan(8°)| máximo
  let best = 0;
  let bestScore = -1;
  for (let a = -8; a <= 8; a += 0.5) {
    const t = Math.tan((a * Math.PI) / 180);
    const hist = new Float64Array(h + offset * 2);
    for (let i = 0; i < xs.length; i++) {
      const r = Math.round(ys[i] - xs[i] * t + offset);
      if (r >= 0 && r < hist.length) hist[r]++;
    }
    let score = 0;
    for (let i = 0; i < hist.length; i++) score += hist[i] * hist[i];
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

// Rota la imagen en gris para corregir el ángulo estimado (relleno blanco).
// Una línea con pendiente tan(deg) queda horizontal tras esta rotación.
export function rotateGray(gray: Uint8ClampedArray, w: number, h: number, deg: number): void {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = w / 2;
  const cy = h / 2;
  const out = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) out[y * w + x] = gray[sy * w + sx];
    }
  }
  gray.set(out);
}
