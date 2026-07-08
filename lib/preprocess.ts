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
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }

  stretchContrast(gray);
  let mask = binarize(gray, w, h);

  // las rayas del papel son paralelas al texto: ayudan al deskew, se quitan después
  const angle = estimateSkew(mask, w, h);
  if (process.env.NODE_ENV !== 'production') console.debug('[glyf] skew estimado:', angle);
  if (Math.abs(angle) >= MIN_SKEW_DEG) {
    rotateGray(gray, w, h, angle);
    mask = binarize(gray, w, h);
  }
  removeRuledLines(mask, w, h);
  return { mask, width: w, height: h };
}

// Papel rayado: las rayas se binarizan como tinta y puentean los renglones.
// Borra tramos horizontales de tinta más anchos que cualquier letra.
// ponytail: umbral 10% del ancho asume raya residual ≤0.25° tras el deskew
// (paso de 0.5°); mejora = detección morfológica de líneas si aparecen fotos
// con rayas más torcidas.
export function removeRuledLines(mask: Uint8Array, w: number, h: number): void {
  const maxRun = Math.round(w * 0.1);
  for (let y = 0; y < h; y++) {
    let runStart = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && mask[y * w + x] === 1;
      if (on && runStart < 0) runStart = x;
      if (!on && runStart >= 0) {
        if (x - runStart > maxRun) mask.fill(0, y * w + runStart, y * w + x);
        runStart = -1;
      }
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
