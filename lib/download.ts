import type { Font } from 'opentype.js';

// ponytail: opentype.js escribe contornos CFF; .ttf y .otf comparten el mismo
// buffer (lo abren igual macOS/Windows/Linux). Conversión real a contornos
// glyf/TrueType requeriría otra librería (p. ej. fonteditor-core).
export function downloadFont(font: Font, family: string, ext: 'ttf' | 'otf'): void {
  const buf = font.toArrayBuffer();
  const blob = new Blob([buf], { type: ext === 'otf' ? 'font/otf' : 'font/ttf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glyf-${family.replace(/\s+/g, '')}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
