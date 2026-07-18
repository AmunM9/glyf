import type { Lang } from './charset';

export interface Copy {
  tagline: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  langLabel: string;
  fontNameLabel: string;
  continue_: string;
  back: string;
  sheetTitle: string;
  sheetHint: string;
  dropHint: string;
  browse: string;
  camera: string;
  stagePre: string;
  stageSeg: string;
  stageVec: string;
  stageBuild: string;
  reviewHint: string;
  rowLabel: string;
  expected: string;
  detected: string;
  rowOk: string;
  rowCheck: string;
  merge: string;
  split: string;
  omitCrop: string;
  omitChar: string;
  missing: string;
  duplicate: string;
  buildFont: string;
  previewPlaceholder: string;
  previewSample: string;
  sizeLabel: string;
  clear: string;
  downloadTtf: string;
  downloadOtf: string;
  restart: string;
  backToReview: string;
  eraserTitle: string;
  eraserHint: string;
  brushLabel: string;
  undo: string;
  reset: string;
  cancel: string;
  apply: string;
  warnings: string;
  errRows: (found: number, want: number) => string;
  errRowShort: (row: number, found: number, want: number) => string;
  errGeneric: string;
  errNoInk: string;
  pipeline: string;
}

export const STR: Record<Lang, Copy> = {
  es: {
    tagline: 'type from a photo',
    step1: 'idioma y nombre',
    step2: 'cartilla + foto',
    step3: 'revisión de glifos',
    step4: 'escribe y descarga',
    langLabel: 'idioma de la cartilla',
    fontNameLabel: 'nombre de la fuente',
    continue_: 'continuar',
    back: 'volver',
    sheetTitle: 'cartilla de referencia',
    sheetHint:
      'Escribe en papel blanco, con lapicero/marcador oscuro, en letra imprenta (no cursiva), separando bien cada carácter, una fila por renglón, en el mismo orden. Luego sube una sola foto.',
    dropHint: 'arrastra tu foto aquí o',
    browse: 'elegir archivo',
    camera: 'usar cámara',
    stagePre: 'preproceso',
    stageSeg: 'segmentación',
    stageVec: 'vectorización',
    stageBuild: 'construcción',
    reviewHint:
      'El conteo no coincide en las filas marcadas. Asigna, fusiona, divide u omite cada recorte antes de construir la fuente.',
    rowLabel: 'fila',
    expected: 'esperados',
    detected: 'detectados',
    rowOk: 'ok',
    rowCheck: 'revisar',
    merge: 'fusionar →',
    split: 'dividir',
    omitCrop: '— omitir recorte —',
    omitChar: 'omitir',
    missing: 'sin recorte:',
    duplicate: 'duplicado:',
    buildFont: 'construir fuente',
    previewPlaceholder: 'escribe aquí con tu fuente…',
    previewSample: 'El veloz murciélago hindú comía feliz. ¿Cañón? ¡Sí!',
    sizeLabel: 'tamaño',
    clear: 'limpiar',
    downloadTtf: 'descargar .ttf',
    downloadOtf: 'descargar .otf',
    restart: 'empezar de nuevo',
    backToReview: 'revisar glifos',
    eraserTitle: 'limpiar carácter',
    eraserHint: 'Pinta sobre el recorte para borrar imperfecciones (motas, restos de rayas).',
    brushLabel: 'pincel',
    undo: 'deshacer',
    reset: 'restaurar original',
    cancel: 'cancelar',
    apply: 'aplicar',
    warnings: 'avisos',
    errRows: (found, want) =>
      `Detecté ${found} renglones y esperaba ${want}. Separa más las filas, evita sombras fuertes y vuelve a intentar.`,
    errRowShort: (row, found, want) =>
      `Fila ${row}: ${found} de ${want} caracteres detectados.`,
    errGeneric:
      'No pude procesar la foto. Prueba con más luz, papel blanco y trazo oscuro.',
    errNoInk: 'No encontré texto en la foto. ¿Subiste la imagen correcta?',
    pipeline:
      'pipeline: Otsu → deskew → imagetracer → opentype.js · client-side · zero upload',
  },
  en: {
    tagline: 'type from a photo',
    step1: 'language & name',
    step2: 'sheet + photo',
    step3: 'glyph review',
    step4: 'type & download',
    langLabel: 'sheet language',
    fontNameLabel: 'font name',
    continue_: 'continue',
    back: 'back',
    sheetTitle: 'reference sheet',
    sheetHint:
      'Write on white paper with a dark pen/marker, in print letters (not cursive), spacing each character well, one row per line, in this exact order. Then upload a single photo.',
    dropHint: 'drag your photo here or',
    browse: 'choose file',
    camera: 'use camera',
    stagePre: 'preprocess',
    stageSeg: 'segmentation',
    stageVec: 'vectorization',
    stageBuild: 'build',
    reviewHint:
      'Counts do not match in the marked rows. Assign, merge, split or omit each crop before building the font.',
    rowLabel: 'row',
    expected: 'expected',
    detected: 'detected',
    rowOk: 'ok',
    rowCheck: 'review',
    merge: 'merge →',
    split: 'split',
    omitCrop: '— omit crop —',
    omitChar: 'omit',
    missing: 'no crop:',
    duplicate: 'duplicate:',
    buildFont: 'build font',
    previewPlaceholder: 'type here with your font…',
    previewSample: 'The quick brown fox jumps over the lazy dog.',
    sizeLabel: 'size',
    clear: 'clear',
    downloadTtf: 'download .ttf',
    downloadOtf: 'download .otf',
    restart: 'start over',
    backToReview: 'review glyphs',
    eraserTitle: 'clean character',
    eraserHint: 'Paint over the crop to erase imperfections (specks, leftover line bits).',
    brushLabel: 'brush',
    undo: 'undo',
    reset: 'restore original',
    cancel: 'cancel',
    apply: 'apply',
    warnings: 'warnings',
    errRows: (found, want) =>
      `I detected ${found} text rows but expected ${want}. Separate the rows more, avoid hard shadows and try again.`,
    errRowShort: (row, found, want) =>
      `Row ${row}: ${found} of ${want} characters detected.`,
    errGeneric:
      'Could not process the photo. Try better light, white paper and a dark stroke.',
    errNoInk: 'No text found in the photo. Did you upload the right image?',
    pipeline:
      'pipeline: Otsu → deskew → imagetracer → opentype.js · client-side · zero upload',
  },
};
