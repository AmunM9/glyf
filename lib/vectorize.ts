// Vectorización raster→curvas con imagetracerjs (dominio público).
// Devuelve contornos en coordenadas absolutas de la imagen; los agujeros
// (contadores de o, a, e…) van en sentido inverso para el winding nonzero de TTF.
import type { Binarized } from './preprocess';
import type { Box } from './segment';
import type { TracePath, TraceSegment } from 'imagetracerjs';

export interface QSeg {
  type: 'L' | 'Q';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
}

export type Contour = QSeg[];

const PAD = 2;

// ponytail: imagetracer por defecto (puro JS, sin WASM). Techo = curvas menos
// suaves que potrace; mejora = esm-potrace-wasm tras un flag + config de wasm.
const TRACE_OPTIONS = {
  ltres: 1,
  qtres: 1,
  pathomit: 8,
  colorsampling: 0,
  numberofcolors: 2,
  pal: [
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
  ],
  blurradius: 0,
};

type Tracer = typeof import('imagetracerjs').default;
let tracerPromise: Promise<Tracer> | null = null;

function getTracer(): Promise<Tracer> {
  // import dinámico: nunca se evalúa en SSR
  if (!tracerPromise) tracerPromise = import('imagetracerjs').then((m) => m.default);
  return tracerPromise;
}

export function cropToImageData(bin: Binarized, box: Box, pad = PAD): ImageData {
  const w = box.w + pad * 2;
  const h = box.h + pad * 2;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let dy = 0; dy < box.h; dy++) {
    for (let dx = 0; dx < box.w; dx++) {
      if (bin.mask[(box.y + dy) * bin.width + box.x + dx]) {
        const off = ((dy + pad) * w + dx + pad) * 4;
        data[off] = 0;
        data[off + 1] = 0;
        data[off + 2] = 0;
      }
    }
  }
  return new ImageData(data, w, h);
}

export async function vectorizeCrop(bin: Binarized, box: Box): Promise<Contour[]> {
  const tracer = await getTracer();
  const imgd = cropToImageData(bin, box);
  const trace = tracer.imagedataToTracedata(imgd, TRACE_OPTIONS);

  const contours: Contour[] = [];
  const offX = box.x - PAD;
  const offY = box.y - PAD;

  trace.layers.forEach((layer, li) => {
    const c = trace.palette[li];
    const isDark = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 128;
    if (!isDark) return;
    for (const path of layer) {
      if (path.isholepath) continue; // los agujeros se emiten con su padre
      contours.push(toContour(path.segments, offX, offY, false));
      for (const childIdx of path.holechildren) {
        const hole: TracePath | undefined = layer[childIdx];
        if (hole) contours.push(toContour(hole.segments, offX, offY, true));
      }
    }
  });
  return contours.filter((c) => c.length > 0);
}

function toContour(segments: TraceSegment[], offX: number, offY: number, reverse: boolean): Contour {
  const mapped: QSeg[] = segments.map((s) => ({
    type: s.type,
    x1: s.x1 + offX,
    y1: s.y1 + offY,
    x2: s.x2 + offX,
    y2: s.y2 + offY,
    x3: s.x3 !== undefined ? s.x3 + offX : undefined,
    y3: s.y3 !== undefined ? s.y3 + offY : undefined,
  }));
  if (!reverse) return mapped;
  // invierte el sentido: recorre al revés intercambiando extremos
  return mapped
    .slice()
    .reverse()
    .map((s) =>
      s.type === 'L'
        ? { type: 'L' as const, x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 }
        : {
            type: 'Q' as const,
            x1: s.x3 as number,
            y1: s.y3 as number,
            x2: s.x2,
            y2: s.y2,
            x3: s.x1,
            y3: s.y1,
          },
    );
}
