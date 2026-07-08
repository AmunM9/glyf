# [glyf]

type from a photo — genera una fuente `.ttf`/`.otf` desde una sola foto de tu letra, 100% en el navegador (sin backend, cero uploads).

## Correr

```bash
npm install
npm run dev        # http://localhost:3000
npm run selfcheck  # verificación ejecutable del pipeline (segmentación → vectorización → fuente)
npm run build      # build de producción (deployable en Vercel sin config extra)
```

## Cómo usar la cartilla

1. Elige idioma (ES/EN) y nombre de la fuente.
2. Copia la cartilla de la pantalla **a mano** en papel blanco: lapicero/marcador oscuro, letra imprenta, una fila por renglón, en el mismo orden, separando bien cada carácter.
3. Sube una sola foto (o usa la cámara). La app corrige EXIF, contraste, sombra suave y foto torcida.
4. Si algún renglón no cuadra, la revisión de glifos te deja reasignar, fusionar, dividir u omitir recortes.
5. Escribe con tu fuente en la previsualización y descárgala.

El `espacio` no se dibuja: se genera sintético. El modo "reutilizar tildes" reduce la fila 7 a `á ñ ü` y compone `é í ó ú Ñ` (menos escritura, calidad dependiente de un solo trazo).

## Licencias

- [opentype.js](https://github.com/opentypejs/opentype.js) — MIT
- [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) — dominio público (Unlicense)
- Si algún día se activa `esm-potrace-wasm` como trazador alternativo, es GPL-2.0.

La fuente exportada usa contornos CFF (lo que escribe opentype.js); `.ttf` y `.otf` comparten el mismo buffer.
