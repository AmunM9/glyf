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
3. Sube una sola foto (o usa la cámara). La app detecta el papel (recorta la mesa u objetos alrededor y endereza la perspectiva), corrige EXIF, contraste, sombra suave, foto torcida y elimina rayas/cuadrículas del cuaderno.
4. Si algún renglón no cuadra, la revisión de glifos te deja reasignar, fusionar, dividir u omitir recortes, y limpiar imperfecciones con el borrador (clic en el recorte).
5. Escribe con tu fuente en la previsualización y descárgala. Desde ahí puedes volver a la revisión para retocar.

El `espacio` no se dibuja: se genera sintético.

## Licencias

- [opentype.js](https://github.com/opentypejs/opentype.js) — MIT
- [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) — dominio público (Unlicense)
- Si algún día se activa `esm-potrace-wasm` como trazador alternativo, es GPL-2.0.

La fuente exportada usa contornos CFF (lo que escribe opentype.js); `.ttf` y `.otf` comparten el mismo buffer.
