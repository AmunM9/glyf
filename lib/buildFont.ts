// Construcción de la fuente con opentype.js: escala global por altura-x,
// línea base por renglón, .notdef + space sintéticos y composición de acentos.
import opentype from 'opentype.js';
import { X_HEIGHT_CHARS, BASELINE_SNAP } from './charset';
import type { Box } from './segment';
import type { Contour } from './vectorize';

export interface GlyphSource {
  char: string;
  rowIndex: number;
  box: Box;
  contours: Contour[];
}

export interface BuiltFont {
  font: opentype.Font;
  warnings: string[];
}

const UPM = 1000;
const ASCENDER = 800;
const DESCENDER = -200;
const X_HEIGHT_UNITS = 500; // la altura-x mapea a 0.5·em
const SIDE_BEARING = 60; // ≈0.06·em por lado
const SPACE_ADVANCE = 300;
const ACCENT_MIN_Y = X_HEIGHT_UNITS * 0.95; // sobre esto vive un acento/punto de la i

type Cmd = opentype.PathCommand;

interface Built {
  path: opentype.Path;
  advance: number;
}

export function buildGlyfFont(
  sources: GlyphSource[],
  opts: { familyName: string; reuseAccents: boolean },
): BuiltFont {
  const warnings: string[] = [];
  const byChar = new Map<string, GlyphSource>();
  for (const s of sources) {
    if (byChar.has(s.char)) warnings.push(`glifo duplicado ignorado: ${s.char}`);
    else byChar.set(s.char, s);
  }

  // Escala global única: mediana de la altura de las minúsculas sin trazos altos/bajos.
  const xHeights = sources
    .filter((s) => X_HEIGHT_CHARS.has(s.char))
    .map((s) => s.box.h)
    .sort((a, b) => a - b);
  const fallbackHeights = sources.map((s) => s.box.h).sort((a, b) => a - b);
  const xHeightPx = xHeights.length
    ? xHeights[xHeights.length >> 1]
    : fallbackHeights[fallbackHeights.length >> 1] * 0.55;
  if (!xHeightPx || !isFinite(xHeightPx)) throw new Error('sin glifos medibles');
  const scale = X_HEIGHT_UNITS / xHeightPx;

  // Línea base por renglón: mediana del borde inferior de los glifos sin descendente.
  const baselines = new Map<number, number>();
  const rowIndexes = new Set(sources.map((s) => s.rowIndex));
  for (const ri of rowIndexes) {
    const inRow = sources.filter((s) => s.rowIndex === ri);
    const anchors = inRow.filter((s) => BASELINE_SNAP.has(s.char));
    const bottoms = (anchors.length ? anchors : inRow)
      .map((s) => s.box.y + s.box.h)
      .sort((a, b) => a - b);
    baselines.set(ri, bottoms[bottoms.length >> 1]);
  }

  const built = new Map<string, Built>();
  for (const src of byChar.values()) {
    built.set(src.char, buildPath(src, baselines.get(src.rowIndex) as number, scale));
  }

  if (opts.reuseAccents) composeAccented(built, warnings);

  const glyphs: opentype.Glyph[] = [
    // .notdef obligatorio en índice 0
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    // space sintético: sin él la barra espaciadora no funciona
    new opentype.Glyph({ name: 'space', unicode: 0x20, advanceWidth: SPACE_ADVANCE, path: new opentype.Path() }),
  ];
  for (const [char, b] of built) {
    const code = char.codePointAt(0) as number;
    glyphs.push(
      new opentype.Glyph({
        name: /^[A-Za-z0-9]$/.test(char) ? char : `uni${code.toString(16).toUpperCase().padStart(4, '0')}`,
        unicode: code,
        advanceWidth: b.advance,
        path: b.path,
      }),
    );
  }

  const font = new opentype.Font({
    familyName: opts.familyName,
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs,
  });

  selfCheck(font, built, warnings);
  return { font, warnings };
}

function buildPath(src: GlyphSource, baselinePx: number, scale: number): Built {
  const { box, contours, char } = src;
  // FALLO→SOLUCIÓN eje Y: SVG crece hacia abajo, la fuente hacia arriba.
  // (baseY − y)·scale voltea y deja la línea base en y=0. Los que se apoyan en
  // la base se snapean (quita el jitter); el resto conserva su offset medido,
  // así , ; ¿ ¡ ' " - conservan su clase vertical y los descendentes bajan libres.
  const snap = BASELINE_SNAP.has(char);
  const baseY = snap ? box.y + box.h : baselinePx;
  const X = (x: number) => SIDE_BEARING + (x - box.x) * scale;
  const Y = (y: number) => (baseY - y) * scale;

  const path = new opentype.Path();
  for (const contour of contours) {
    if (!contour.length) continue;
    path.moveTo(X(contour[0].x1), Y(contour[0].y1));
    for (const s of contour) {
      if (s.type === 'L') path.lineTo(X(s.x2), Y(s.y2));
      else path.quadTo(X(s.x2), Y(s.y2), X(s.x3 as number), Y(s.y3 as number));
    }
    path.close();
  }
  return { path, advance: Math.round(box.w * scale + SIDE_BEARING * 2) };
}

// Modo reutilización: é í ó ú = vocal base + acento extraído de 'á';
// Ñ = N + tilde extraída de 'ñ'. Los paths se concatenan (más portable que
// la tabla de glifos compuestos).
function composeAccented(built: Map<string, Built>, warnings: string[]): void {
  const acute = extractMark(built.get('á'));
  if (acute) {
    for (const [target, base] of [
      ['é', 'e'],
      ['í', 'i'],
      ['ó', 'o'],
      ['ú', 'u'],
    ] as const) {
      const b = built.get(base);
      if (!b) {
        warnings.push(`falta '${base}' para componer '${target}'`);
        continue;
      }
      // la í pierde el punto de la i antes de recibir el acento
      const baseCmds =
        base === 'i'
          ? subpaths(b.path.commands).filter((sp) => bboxOf(sp).minY <= ACCENT_MIN_Y).flat()
          : b.path.commands;
      built.set(target, composeWith(baseCmds, b.advance, acute));
    }
  } else {
    warnings.push("no pude extraer el acento de 'á'; é í ó ú omitidas");
  }

  const tilde = extractMark(built.get('ñ'));
  const n = built.get('N');
  if (tilde && n) {
    // sube la tilde por encima de la N mayúscula
    const capTop = bboxOf(n.path.commands).maxY;
    const lift = Math.max(0, capTop + 40 - tilde.bbox.minY);
    built.set('Ñ', composeWith(n.path.commands, n.advance, { ...tilde, dy: lift }));
  } else if (!built.has('Ñ')) {
    warnings.push("no pude componer 'Ñ' (falta tilde de 'ñ' o la 'N')");
  }
}

interface Mark {
  cmds: Cmd[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  dy?: number;
}

// El acento/tilde son los subpaths que viven por encima de la altura-x.
function extractMark(glyph: Built | undefined): Mark | null {
  if (!glyph) return null;
  const marks = subpaths(glyph.path.commands).filter((sp) => bboxOf(sp).minY > ACCENT_MIN_Y);
  if (!marks.length) return null;
  const cmds = marks.flat();
  return { cmds, bbox: bboxOf(cmds) };
}

function composeWith(baseCmds: Cmd[], advance: number, mark: Mark): Built {
  // centrado horizontal sobre el ancho de avance de la base; misma altura
  // a la que se escribió sobre la 'á' (comparten altura-x) salvo dy explícito.
  const dx = advance / 2 - (mark.bbox.minX + mark.bbox.maxX) / 2;
  const path = new opentype.Path();
  path.commands = [...cloneCmds(baseCmds, 0, 0), ...cloneCmds(mark.cmds, dx, mark.dy ?? 0)];
  return { path, advance };
}

function subpaths(cmds: Cmd[]): Cmd[][] {
  const out: Cmd[][] = [];
  let cur: Cmd[] = [];
  for (const c of cmds) {
    if (c.type === 'M' && cur.length) {
      out.push(cur);
      cur = [];
    }
    cur.push(c);
  }
  if (cur.length) out.push(cur);
  return out;
}

function bboxOf(cmds: Cmd[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cmds) {
    const pts: [number, number][] = [];
    if ('x' in c && typeof c.x === 'number') pts.push([c.x, c.y as number]);
    if ('x1' in c && typeof c.x1 === 'number') pts.push([c.x1, c.y1 as number]);
    if ('x2' in c && typeof c.x2 === 'number') pts.push([c.x2, c.y2 as number]);
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function cloneCmds(cmds: Cmd[], dx: number, dy: number): Cmd[] {
  return cmds.map((c) => {
    const copy = { ...c } as Record<string, unknown> & Cmd;
    if ('x' in copy && typeof copy.x === 'number') {
      copy.x += dx;
      copy.y = (copy.y as number) + dy;
    }
    if ('x1' in copy && typeof copy.x1 === 'number') {
      copy.x1 += dx;
      copy.y1 = (copy.y1 as number) + dy;
    }
    if ('x2' in copy && typeof copy.x2 === 'number') {
      copy.x2 += dx;
      copy.y2 = (copy.y2 as number) + dy;
    }
    return copy;
  });
}

// ponytail: verificación ejecutable tras construir — invariantes de una fuente válida.
function selfCheck(font: opentype.Font, built: Map<string, Built>, warnings: string[]): void {
  console.assert(font.glyphs.get(0).name === '.notdef', '[glyf] falta .notdef en índice 0');
  let hasSpace = false;
  const summary: { char: string; advance: number; contours: number }[] = [];
  for (let i = 0; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i);
    if (g.unicode === 0x20) hasSpace = true;
    const adv = g.advanceWidth ?? 0;
    console.assert(isFinite(adv) && adv > 0 || g.name === '.notdef', `[glyf] advanceWidth inválido: ${g.name}`);
  }
  console.assert(hasSpace, '[glyf] falta el glifo space');
  for (const [char, b] of built) {
    const contours = subpaths(b.path.commands).length;
    if (contours === 0) warnings.push(`glifo vacío: ${char}`);
    summary.push({ char, advance: b.advance, contours });
  }
  console.table(summary);
}
