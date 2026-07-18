// Orden fijo de la cartilla. La asignación de glifos es puramente posicional (sin OCR).
export type Lang = 'es' | 'en';

const UPPER_1 = [...'ABCDEFGHIJKLM'];
const UPPER_2 = [...'NOPQRSTUVWXYZ'];
const LOWER_1 = [...'abcdefghijklm'];
const LOWER_2 = [...'nopqrstuvwxyz'];
const DIGITS = [...'0123456789'];
const PUNCT_ES = ['.', ',', ':', ';', '!', '?', '¡', '¿', "'", '"', '(', ')', '-'];
const PUNCT_EN = ['.', ',', ':', ';', '!', '?', "'", '"', '(', ')', '-'];
const ACCENTS_ES = [...'áéíóúñüÑ'];

export function getRows(lang: Lang): string[][] {
  const rows = [
    UPPER_1,
    UPPER_2,
    LOWER_1,
    LOWER_2,
    DIGITS,
    lang === 'es' ? PUNCT_ES : PUNCT_EN,
  ];
  if (lang === 'es') rows.push(ACCENTS_ES);
  return rows;
}

// Minúsculas sin ascendente ni descendente: definen la altura-x global.
export const X_HEIGHT_CHARS = new Set([...'acemnorsuvwxz']);

export const DESCENDER_CHARS = new Set([...'gjpqy']);

// Caracteres cuya base se apoya exactamente en la línea base: se "snapean" a y=0.
// El resto (comas, signos invertidos, comillas, guiones…) conserva su posición
// vertical medida respecto a la línea base del renglón.
export const BASELINE_SNAP = new Set([
  ...UPPER_1,
  ...UPPER_2,
  ...DIGITS,
  ...'abcdefhiklmnorstuvwxz',
  ...'áéíóúñüÑ',
  '.',
  '!',
  '?',
]);

// ponytail: self-check ejecutable del charset; falla en dev si el orden se rompe.
if (process.env.NODE_ENV !== 'production') {
  console.assert(
    getRows('es').map((r) => r.length).join() === '13,13,13,13,10,13,8',
    '[glyf] charset es roto',
  );
  console.assert(
    getRows('en').map((r) => r.length).join() === '13,13,13,13,10,11',
    '[glyf] charset en roto',
  );
}
