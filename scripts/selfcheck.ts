// Verificación ejecutable del pipeline sin frameworks (ponytail):
// segmentación → deskew → vectorización → fuente válida. `npm run selfcheck`.
import assert from 'node:assert';
import type { Binarized } from '../lib/preprocess';
import {
  estimateSkew,
  extractPaper,
  fixOrientation,
  homography,
  otsu,
  removeGridLines,
  rotateGray,
} from '../lib/preprocess';
import { segmentSheet } from '../lib/segment';
import { buildGlyfFont, type GlyphSource } from '../lib/buildFont';
import opentype from 'opentype.js';

// Polyfill mínimo de ImageData para correr vectorize.ts en node.
class ImageDataPoly {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}
Reflect.set(globalThis, 'ImageData', ImageDataPoly);

function makeBin(width: number, height: number): Binarized {
  return { mask: new Uint8Array(width * height), width, height };
}

function rect(bin: Binarized, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) bin.mask[(y + dy) * bin.width + x + dx] = 1;
  }
}

function ring(bin: Binarized, x: number, y: number, size: number, thick: number): void {
  rect(bin, x, y, size, thick);
  rect(bin, x, y + size - thick, size, thick);
  rect(bin, x, y, thick, size);
  rect(bin, x + size - thick, y, thick, size);
}

async function main(): Promise<void> {
  // --- otsu: separa una distribución bimodal ---
  const bimodal = new Uint8ClampedArray(1000);
  for (let i = 0; i < 1000; i++) bimodal[i] = i < 300 ? 40 + (i % 10) : 210 + (i % 10);
  const t = otsu(bimodal);
  // Otsu clasifica [0..t] como clase baja; cualquier t del valle es válido
  assert.ok(t >= 45 && t < 210, `otsu fuera de rango: ${t}`);

  // --- segmentación: 3 filas, punto de la "i" agrupado con su cuerpo ---
  const bin = makeBin(600, 400);
  // fila 1: tres glifos, el segundo es una "i" (punto + cuerpo separados)
  rect(bin, 50, 50, 30, 40);
  rect(bin, 120, 50, 8, 8); // punto
  rect(bin, 120, 66, 8, 24); // cuerpo
  rect(bin, 180, 50, 30, 40);
  // fila 2: dos glifos
  rect(bin, 50, 170, 30, 40);
  rect(bin, 140, 170, 34, 40);
  // fila 3: tres glifos
  rect(bin, 50, 290, 30, 40);
  rect(bin, 120, 290, 30, 40);
  rect(bin, 190, 290, 30, 40);
  const seg = segmentSheet(bin, [3, 2, 3]);
  assert.deepStrictEqual(
    seg.map((r) => r.boxes.length),
    [3, 2, 3],
    'conteo de glifos por fila',
  );
  const iBox = seg[0].boxes[1];
  assert.ok(iBox.h >= 38, `el punto de la i no se agrupó (h=${iBox.h})`);

  // --- alineación DP: el rayón se salta, nada se corre ---
  {
    const { alignRow } = await import('../lib/align');
    // a (x-height 25px), rayón (5px), b (alta 40px) contra esperados [a, b]
    const boxes = [
      { x: 10, y: 15, w: 22, h: 25 },
      { x: 45, y: 30, w: 6, h: 5 },
      { x: 70, y: 0, w: 24, h: 40 },
    ];
    assert.deepStrictEqual(alignRow(boxes, ['a', 'b']), ['a', null, 'b'], 'rayón corrió la fila');
    // fila completa con mota al inicio: nada se desplaza
    const row = [{ x: 0, y: 20, w: 4, h: 4 }];
    const hs = [40, 25, 25, 40, 25]; // B a c d(alta) e → usa alturas coherentes
    const chars = ['B', 'a', 'c', 'd', 'e'];
    const expH = [40, 25, 25, 40, 25];
    for (let i = 0; i < 5; i++) row.push({ x: 20 + i * 30, y: 40 - expH[i], w: 20, h: hs[i] });
    assert.deepStrictEqual(
      alignRow(row, chars),
      [null, ...chars],
      'mota inicial desplazó la asignación',
    );
  }

  // --- orientación automática: 90° y 180° se corrigen; la correcta no se toca ---
  {
    const w = 600;
    const h = 450;
    // cartilla "pesada arriba": 4 filas densas + 2 ligeras (como la real)
    const sheet = makeBin(w, h);
    for (let ri = 0; ri < 4; ri++) {
      for (let ci = 0; ci < 10; ci++) rect(sheet, 40 + ci * 52, 40 + ri * 60, 34, 38);
    }
    for (let ci = 0; ci < 8; ci++) rect(sheet, 40 + ci * 52, 40 + 4 * 60, 18, 20);
    for (let ci = 0; ci < 6; ci++) rect(sheet, 40 + ci * 52, 40 + 5 * 60, 10, 10);
    const grayDummy = new Uint8ClampedArray(w * h);

    const ok = fixOrientation(grayDummy, sheet.mask, w, h);
    assert.ok(
      ok.width === w && ok.mask.every((v, i) => v === sheet.mask[i]),
      'orientación correcta fue modificada',
    );

    const rot180 = new Uint8Array(w * h);
    for (let i = 0; i < rot180.length; i++) rot180[i] = sheet.mask[rot180.length - 1 - i];
    const fixed180 = fixOrientation(new Uint8ClampedArray(w * h), rot180, w, h);
    assert.ok(
      fixed180.width === w && fixed180.mask.every((v, i) => v === sheet.mask[i]),
      'foto al revés (180°) no se corrigió',
    );

    // 90° horario: (x,y) → (h-1-y, x) en una imagen h×w
    const rot90 = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) rot90[x * h + (h - 1 - y)] = sheet.mask[y * w + x];
    }
    const fixed90 = fixOrientation(new Uint8ClampedArray(w * h), rot90, h, w);
    assert.ok(
      fixed90.width === w && fixed90.height === h,
      `foto de lado (90°) no se enderezó (${fixed90.width}x${fixed90.height})`,
    );
    assert.ok(
      fixed90.mask.every((v, i) => v === sheet.mask[i]),
      'foto de lado (90°) quedó en orientación equivocada',
    );
  }

  // --- homografía: identidad para un mapeo rectángulo→rectángulo trivial ---
  const idPts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ];
  const Hid = homography(idPts, idPts);
  assert.ok(Hid, 'homografía identidad no resuelta');
  assert.ok(
    Math.abs((Hid as number[])[0] - 1) < 1e-6 && Math.abs((Hid as number[])[2]) < 1e-6,
    'homografía identidad incorrecta',
  );

  // --- detección de papel: recorta mesa oscura y esfero, conserva el texto ---
  {
    const w = 800;
    const h = 600;
    const gray = new Uint8ClampedArray(w * h).fill(50); // mesa oscura
    // papel claro
    for (let y = 100; y < 500; y++) for (let x = 150; x < 650; x++) gray[y * w + x] = 235;
    // "texto" dentro del papel
    for (let y = 200; y < 220; y++) for (let x = 250; x < 400; x++) gray[y * w + x] = 20;
    // "esfero" fuera del papel
    for (let y = 250; y < 400; y++) for (let x = 40; x < 60; x++) gray[y * w + x] = 30;
    const out = extractPaper(gray, w, h);
    assert.ok(out.width < w && out.height < h, 'no recortó el papel');
    // el borde del resultado es papel, no mesa ni esfero
    let darkBorder = 0;
    for (let x = 0; x < out.width; x++) {
      if (out.gray[x] < 100) darkBorder++;
      if (out.gray[(out.height - 1) * out.width + x] < 100) darkBorder++;
    }
    for (let y = 0; y < out.height; y++) {
      if (out.gray[y * out.width] < 100) darkBorder++;
      if (out.gray[y * out.width + out.width - 1] < 100) darkBorder++;
    }
    assert.strictEqual(darkBorder, 0, `el recorte incluye mesa/esfero (${darkBorder} px oscuros de borde)`);
    // el "texto" sigue dentro
    let darkInside = 0;
    for (let i = 0; i < out.gray.length; i++) if (out.gray[i] < 100) darkInside++;
    assert.ok(darkInside > 1500, `el texto se perdió al recortar (${darkInside} px)`);
  }

  // --- detección de papel: foto que ya es puro papel queda intacta ---
  {
    const w = 400;
    const h = 300;
    const gray = new Uint8ClampedArray(w * h).fill(240);
    for (let y = 100; y < 120; y++) for (let x = 50; x < 200; x++) gray[y * w + x] = 20;
    const out = extractPaper(gray, w, h);
    assert.ok(out.width === w && out.height === h, 'recortó una foto que ya era puro papel');
  }

  // --- detección de papel: papel rotado se endereza con la homografía ---
  {
    const w = 800;
    const h = 600;
    const gray = new Uint8ClampedArray(w * h).fill(45);
    const rad = (8 * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // papel de 460x320 rotado 8° alrededor del centro
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - w / 2;
        const dy = y - h / 2;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        if (Math.abs(u) < 230 && Math.abs(v) < 160) gray[y * w + x] = 235;
      }
    }
    const out = extractPaper(gray, w, h);
    // el warp debe devolver aprox. las dimensiones reales del papel
    assert.ok(
      Math.abs(out.width - 460) < 50 && Math.abs(out.height - 320) < 40,
      `warp de papel rotado devolvió ${out.width}x${out.height}, esperaba ≈460x320`,
    );
    let dark = 0;
    for (let i = 0; i < out.gray.length; i++) if (out.gray[i] < 100) dark++;
    assert.ok(dark / out.gray.length < 0.02, `el papel enderezado contiene mesa (${dark} px oscuros)`);
  }

  // --- papel cuadriculado: rayas h+v se eliminan sin partir las letras ---
  const rbin = makeBin(600, 400);
  rect(rbin, 50, 50, 30, 40);
  rect(rbin, 120, 50, 30, 40);
  rect(rbin, 50, 170, 30, 40);
  rect(rbin, 140, 170, 34, 40);
  rect(rbin, 50, 290, 30, 40);
  rect(rbin, 120, 290, 30, 40);
  for (let y = 10; y < 400; y += 60) rect(rbin, 0, y, 600, 2); // rayas horizontales
  for (let x = 10; x < 600; x += 60) rect(rbin, x, 0, 2, 400); // líneas verticales
  removeGridLines(rbin.mask, rbin.width, rbin.height);
  const rseg = segmentSheet(rbin, [2, 2, 2]);
  assert.deepStrictEqual(
    rseg.map((r) => r.boxes.length),
    [2, 2, 2],
    'la cuadrícula puentea o parte letras',
  );
  // la letra cruzada por la cuadrícula (x=50 la cruza y=70) sigue siendo UNA caja completa
  const crossed = rseg[0].boxes[0];
  assert.ok(crossed.w >= 30 && crossed.h >= 40, `letra cruzada por raya quedó partida (${crossed.w}x${crossed.h})`);
  // las rayas se fueron: solo pueden quedar motas de los cruces línea×línea
  // (grosor doble, no "finas"), que el filtro de ruido descarta después
  let leftover = 0;
  for (let y = 340; y < 400; y++) {
    for (let x = 300; x < 600; x++) leftover += rbin.mask[y * rbin.width + x];
  }
  assert.ok(leftover < 40, `quedaron ${leftover} píxeles de cuadrícula (esperaba solo motas de cruces)`);

  // --- filas puenteadas por un descendente: la escalera de umbrales separa ---
  const bbin = makeBin(600, 300);
  rect(bbin, 50, 60, 30, 44);
  rect(bbin, 120, 60, 30, 44);
  rect(bbin, 50, 180, 30, 44);
  rect(bbin, 120, 180, 30, 44);
  rect(bbin, 130, 104, 4, 76); // "descendente" que conecta ambas filas
  const bseg = segmentSheet(bbin, [2, 2]);
  assert.strictEqual(bseg.length, 2, 'escalera de umbrales no separó filas puenteadas');

  // --- colapso total: un solo renglón gordo se divide por su valle interno ---
  const cbin = makeBin(600, 300);
  rect(cbin, 50, 60, 30, 44);
  rect(cbin, 120, 60, 30, 44);
  rect(cbin, 50, 150, 30, 44);
  rect(cbin, 120, 150, 30, 44);
  rect(cbin, 200, 60, 50, 134); // bloque ancho que une todo a cualquier umbral
  const cseg = segmentSheet(cbin, [2, 2]);
  assert.strictEqual(cseg.length, 2, 'split por valle interno no dividió el renglón doble');

  // --- deskew: líneas a 4° se detectan y se corrigen ---
  const w = 600;
  const h = 400;
  const gray = new Uint8ClampedArray(w * h).fill(255);
  const tan4 = Math.tan((4 * Math.PI) / 180);
  for (const y0 of [80, 160, 240, 320]) {
    for (let x = 20; x < w - 20; x++) {
      const y = Math.round(y0 + x * tan4);
      for (let k = 0; k < 4; k++) if (y + k < h) gray[(y + k) * w + x] = 20;
    }
  }
  const maskOf = (g: Uint8ClampedArray) => {
    const m = new Uint8Array(g.length);
    for (let i = 0; i < g.length; i++) if (g[i] < 128) m[i] = 1;
    return m;
  };
  const angle = estimateSkew(maskOf(gray), w, h);
  assert.ok(Math.abs(angle - 4) <= 0.75, `skew estimado ${angle}, esperaba ≈4`);
  rotateGray(gray, w, h, angle);
  const after = estimateSkew(maskOf(gray), w, h);
  assert.ok(Math.abs(after) <= 0.75, `skew tras corregir ${after}, esperaba ≈0`);

  // --- vectorización + fuente: la "o" conserva su contador (winding opuesto) ---
  const { vectorizeCrop } = await import('../lib/vectorize');
  const fbin = makeBin(300, 160);
  ring(fbin, 20, 60, 40, 10); // 'o' con agujero, altura-x = 40
  rect(fbin, 90, 60, 36, 40); // 'x'
  rect(fbin, 150, 30, 40, 70); // 'H'
  rect(fbin, 220, 60, 30, 60); // 'g' con descendente (baja de y=100)
  const boxes = segmentSheet(fbin, [4])[0].boxes;
  const chars = ['o', 'x', 'H', 'g'];
  const sources: GlyphSource[] = [];
  for (let i = 0; i < boxes.length; i++) {
    sources.push({ char: chars[i], rowIndex: 0, box: boxes[i], contours: await vectorizeCrop(fbin, boxes[i]) });
  }
  const { font } = buildGlyfFont(sources, { familyName: 'SelfCheck' });

  const parsed = opentype.parse(font.toArrayBuffer());
  assert.strictEqual(parsed.glyphs.get(0).name, '.notdef', '.notdef en índice 0');
  assert.ok((parsed.charToGlyph(' ').advanceWidth ?? 0) > 0, 'space con avance');
  for (const c of chars) {
    const g = parsed.charToGlyph(c);
    assert.ok((g.advanceWidth ?? 0) > 0 && g.path.commands.length > 0, `glifo '${c}' válido`);
  }

  // winding: la 'o' debe tener 2 subpaths con áreas de signo opuesto
  const oCmds = parsed.charToGlyph('o').path.commands;
  const subs: { x: number; y: number }[][] = [];
  for (const c of oCmds) {
    if (c.type === 'M') subs.push([]);
    if ('x' in c && typeof c.x === 'number') subs[subs.length - 1].push({ x: c.x, y: c.y as number });
  }
  assert.strictEqual(subs.length, 2, `la 'o' tiene ${subs.length} contornos, esperaba 2`);
  const area = (pts: { x: number; y: number }[]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  };
  const [a1, a2] = subs.map(area);
  assert.ok(a1 * a2 < 0, `winding del contador no invertido (áreas ${a1.toFixed(0)}, ${a2.toFixed(0)})`);

  // 'g' descendente: su path baja por debajo de la línea base (y<0)
  const gMinY = Math.min(
    ...parsed
      .charToGlyph('g')
      .path.commands.filter((c): c is opentype.PathCommand & { y: number } => 'y' in c && typeof c.y === 'number')
      .map((c) => c.y),
  );
  assert.ok(gMinY < -10, `el descendente de 'g' no baja de la base (minY=${gMinY})`);

  console.log('SELFCHECK OK — segmentación, deskew, winding y fuente válidos');
}

main().catch((e) => {
  console.error('SELFCHECK FAIL:', e);
  process.exit(1);
});
