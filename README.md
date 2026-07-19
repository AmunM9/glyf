# [glyf]

**Tu letra a mano, convertida en fuente real — 100% en el navegador.**

🌐 **Demo:** [glyf-sigma.vercel.app](https://glyf-sigma.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![opentype.js](https://img.shields.io/badge/opentype.js-font%20build-00ff88)
![ImageTracer.js](https://img.shields.io/badge/ImageTracer.js-vectorize-ff3b30)
![Vercel](https://img.shields.io/badge/Vercel-deploy-000000?logo=vercel&logoColor=white)

glyf toma una foto de tu escritura a mano y genera un archivo `.ttf` / `.otf` listo para instalar. Todo el procesamiento ocurre en tu dispositivo: **sin backend, sin subir imágenes a servidores**.

## Cómo funciona

1. **Cartilla** — Copia las filas de letras en una hoja blanca (lapicero o marcador oscuro).
2. **Foto** — Sube una imagen o usa la cámara. La app endereza la perspectiva, mejora el contraste y segmenta cada carácter.
3. **Revisión** — Verifica la detección de cada letra o signo. Puedes reasignar, fusionar, dividir u omitir recortes, y limpiar imperfecciones con el borrador.
4. **Descarga** — Previsualiza tu fuente y descárgala en `.ttf` o `.otf`.

El espacio no se dibuja: se genera de forma sintética.

## Pipeline

```
Otsu → deskew → segmentación → ImageTracer → opentype.js
```

- **Preproceso:** corrección EXIF, contraste, eliminación de cuadrícula/ruido.
- **Segmentación:** detección posicional por filas (sin OCR).
- **Vectorización:** trazado de contornos por carácter.
- **Construcción:** ensamblado de la fuente con métricas alineadas.

## Desarrollo local

```bash
npm install
npm run dev        # http://localhost:3000
npm run selfcheck  # verificación del pipeline (segmentación → vectorización → fuente)
npm run build      # build de producción
```

## Estructura

| Ruta / módulo | Descripción |
|---|---|
| `/` | Landing |
| `/studio` | Flujo completo: cartilla → foto → revisión → descarga |
| `lib/preprocess.ts` | Preprocesamiento de imagen |
| `lib/segment.ts` | Segmentación por filas |
| `lib/vectorize.ts` | Vectorización de recortes |
| `lib/buildFont.ts` | Construcción de la fuente |

## Licencias de dependencias

- [opentype.js](https://github.com/opentypejs/opentype.js) — MIT
- [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) — Unlicense

La fuente exportada usa contornos CFF; `.ttf` y `.otf` comparten el mismo buffer generado por opentype.js.

## Autor

Manuel Torres — [glyf-sigma.vercel.app](https://glyf-sigma.vercel.app)
