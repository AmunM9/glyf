import opentype from 'opentype.js';
import type { Font } from 'opentype.js';

export const DEFAULT_TRACKING = 1;

// Escala el advanceWidth de cada glifo (incl. espacio). factor=1 deja la fuente tal cual.
export function withTracking(source: Font, factor: number): Font {
  if (factor === DEFAULT_TRACKING) return source;

  const glyphs: opentype.Glyph[] = [];
  for (let i = 0; i < source.glyphs.length; i++) {
    const g = source.glyphs.get(i);
    const advance = g.advanceWidth ?? 500;
    glyphs.push(
      new opentype.Glyph({
        name: g.name ?? `.glyph${i}`,
        unicode: g.unicode,
        advanceWidth: Math.max(1, Math.round(advance * factor)),
        path: g.path,
      }),
    );
  }

  return new opentype.Font({
    familyName: source.names.fontFamily.en,
    styleName: source.names.fontSubfamily?.en ?? 'Regular',
    unitsPerEm: source.unitsPerEm,
    ascender: source.ascender,
    descender: source.descender,
    glyphs,
  });
}
