'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Binarized } from '@/lib/preprocess';
import { splitBox, unionBox, type Box, type SegRow } from '@/lib/segment';
import type { Copy } from '@/lib/strings';
import GlyphEraser from './GlyphEraser';

export interface GlyphPick {
  char: string;
  rowIndex: number;
  box: Box;
}

interface Item {
  box: Box;
  assigned: string | null; // null = recorte omitido
}

interface RowState {
  items: Item[];
  omitted: string[]; // caracteres esperados explícitamente omitidos
}

interface Props {
  bin: Binarized;
  segRows: SegRow[];
  expectedRows: string[][];
  // asignación previa confirmada (para volver desde [04] sin perder el trabajo)
  initialPicks?: GlyphPick[] | null;
  t: Copy;
  onConfirm: (picks: GlyphPick[]) => void;
  onBack: () => void;
}

const sameBox = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export default function GlyphReview({
  bin,
  segRows,
  expectedRows,
  initialPicks,
  t,
  onConfirm,
  onBack,
}: Props) {
  const [rows, setRows] = useState<RowState[]>(() =>
    segRows.map((sr, ri) => {
      const rowPicks = initialPicks?.filter((p) => p.rowIndex === ri) ?? [];
      const items = sr.boxes.map((box, ci) => {
        if (rowPicks.length) {
          const match = rowPicks.find((p) => sameBox(p.box, box));
          return { box, assigned: match ? match.char : null };
        }
        // mejor conjetura: asignación posicional
        return { box, assigned: expectedRows[ri][ci] ?? null };
      });
      const omitted = rowPicks.length
        ? expectedRows[ri].filter((c) => !items.some((it) => it.assigned === c))
        : [];
      return { items, omitted };
    }),
  );
  // recorte abierto en el borrador de imperfecciones
  const [erasing, setErasing] = useState<{ ri: number; ii: number } | null>(null);
  // fuerza el re-render de los thumbnails tras editar el mask
  const [maskVersion, setMaskVersion] = useState(0);

  const status = useMemo(
    () =>
      rows.map((row, ri) => {
        const counts = new Map<string, number>();
        for (const it of row.items) {
          if (it.assigned) counts.set(it.assigned, (counts.get(it.assigned) ?? 0) + 1);
        }
        const duplicates = expectedRows[ri].filter((c) => (counts.get(c) ?? 0) > 1);
        const missing = expectedRows[ri].filter(
          (c) => !counts.has(c) && !row.omitted.includes(c),
        );
        return { duplicates, missing, ok: duplicates.length === 0 && missing.length === 0 };
      }),
    [rows, expectedRows],
  );

  const allValid = status.every((s) => s.ok);

  function updateRow(ri: number, fn: (row: RowState) => RowState) {
    setRows((prev) => prev.map((row, i) => (i === ri ? fn(row) : row)));
  }

  function merge(ri: number, ii: number) {
    updateRow(ri, (row) => {
      const a = row.items[ii];
      const b = row.items[ii + 1];
      if (!a || !b) return row;
      const mergedItem: Item = { box: unionBox(a.box, b.box), assigned: a.assigned ?? b.assigned };
      return { ...row, items: [...row.items.slice(0, ii), mergedItem, ...row.items.slice(ii + 2)] };
    });
  }

  function split(ri: number, ii: number) {
    updateRow(ri, (row) => {
      const pair = splitBox(bin, row.items[ii].box);
      if (!pair) return row;
      const [l, r] = pair;
      return {
        ...row,
        items: [
          ...row.items.slice(0, ii),
          { box: l, assigned: row.items[ii].assigned },
          { box: r, assigned: null },
          ...row.items.slice(ii + 1),
        ],
      };
    });
  }

  function assign(ri: number, ii: number, value: string) {
    updateRow(ri, (row) => ({
      ...row,
      items: row.items.map((it, i) => (i === ii ? { ...it, assigned: value || null } : it)),
    }));
  }

  function applyErase(newBox: Box | null) {
    if (!erasing) return;
    const { ri, ii } = erasing;
    updateRow(ri, (row) => ({
      ...row,
      items: row.items.map((it, i) =>
        // el recorte quedó vacío tras borrar → se omite; si no, caja ajustada
        i === ii ? (newBox ? { ...it, box: newBox } : { ...it, assigned: null }) : it,
      ),
    }));
    setMaskVersion((v) => v + 1);
    setErasing(null);
  }

  function toggleOmitChar(ri: number, char: string) {
    updateRow(ri, (row) => ({
      ...row,
      omitted: row.omitted.includes(char)
        ? row.omitted.filter((c) => c !== char)
        : [...row.omitted, char],
    }));
  }

  return (
    <div className="review">
      <p className="hint">{t.reviewHint}</p>
      {rows.map((row, ri) => (
        <section
          key={ri}
          className={`review-row${status[ri].ok ? '' : ' has-issues'}`}
          aria-label={`${t.rowLabel} ${ri + 1}`}
        >
          <header className="review-row-head">
            <span className="row-tag">
              [{String(ri + 1).padStart(2, '0')}] {t.rowLabel} {ri + 1}
            </span>
            <span className="row-counts">
              {t.detected}: {row.items.length} · {t.expected}: {expectedRows[ri].length}
            </span>
            <span className={`row-status ${status[ri].ok ? 'ok' : 'warn'}`}>
              {status[ri].ok ? t.rowOk : t.rowCheck}
            </span>
          </header>
          <div className="review-grid">
            {row.items.map((it, ii) => (
              <div className="review-cell" key={`${it.box.x}-${it.box.y}-${ii}`}>
                <button
                  type="button"
                  className="thumb-button"
                  title={t.eraserTitle}
                  aria-label={`${t.eraserTitle} · ${t.rowLabel} ${ri + 1} · ${ii + 1}`}
                  onClick={() => setErasing({ ri, ii })}
                >
                  <CropThumb bin={bin} box={it.box} version={maskVersion} />
                </button>
                <select
                  className="cell-select"
                  aria-label={`${t.rowLabel} ${ri + 1} · ${ii + 1}`}
                  value={it.assigned ?? ''}
                  onChange={(e) => assign(ri, ii, e.target.value)}
                >
                  <option value="">{t.omitCrop}</option>
                  {expectedRows[ri].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="cell-actions">
                  {ii < row.items.length - 1 && (
                    <button type="button" className="btn btn-mini" onClick={() => merge(ri, ii)}>
                      {t.merge}
                    </button>
                  )}
                  <button type="button" className="btn btn-mini" onClick={() => split(ri, ii)}>
                    {t.split}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {status[ri].missing.length > 0 && (
            <p className="row-missing">
              {t.missing}{' '}
              {status[ri].missing.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="btn btn-mini"
                  onClick={() => toggleOmitChar(ri, c)}
                >
                  {c} · {t.omitChar}
                </button>
              ))}
            </p>
          )}
          {row.omitted.length > 0 && (
            <p className="row-omitted">
              {t.omitChar}: {row.omitted.join(' ')}{' '}
              {row.omitted.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="btn btn-mini"
                  onClick={() => toggleOmitChar(ri, c)}
                >
                  ↩ {c}
                </button>
              ))}
            </p>
          )}
          {status[ri].duplicates.length > 0 && (
            <p className="row-duplicate" role="alert">
              {t.duplicate} {status[ri].duplicates.join(' ')}
            </p>
          )}
        </section>
      ))}
      <div className="review-actions">
        <button type="button" className="btn" onClick={onBack}>
          {t.back}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!allValid}
          onClick={() =>
            onConfirm(
              rows.flatMap((row, ri) =>
                row.items
                  .filter((it): it is Item & { assigned: string } => it.assigned !== null)
                  .map((it) => ({ char: it.assigned, rowIndex: ri, box: it.box })),
              ),
            )
          }
        >
          {t.buildFont}
        </button>
      </div>
      {erasing && (
        <GlyphEraser
          bin={bin}
          box={rows[erasing.ri].items[erasing.ii].box}
          t={t}
          onApply={applyErase}
          onClose={() => setErasing(null)}
        />
      )}
    </div>
  );
}

const THUMB = 56;

function CropThumb({ bin, box, version }: { bin: Binarized; box: Box; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, THUMB, THUMB);
    const raw = document.createElement('canvas');
    raw.width = box.w;
    raw.height = box.h;
    const rctx = raw.getContext('2d');
    if (!rctx) return;
    const img = rctx.createImageData(box.w, box.h);
    for (let dy = 0; dy < box.h; dy++) {
      for (let dx = 0; dx < box.w; dx++) {
        if (bin.mask[(box.y + dy) * bin.width + box.x + dx]) {
          const off = (dy * box.w + dx) * 4;
          img.data[off] = 232;
          img.data[off + 1] = 232;
          img.data[off + 2] = 224;
          img.data[off + 3] = 255;
        }
      }
    }
    rctx.putImageData(img, 0, 0);
    const k = Math.min((THUMB - 8) / box.w, (THUMB - 8) / box.h, 1);
    const dw = Math.max(1, box.w * k);
    const dh = Math.max(1, box.h * k);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raw, (THUMB - dw) / 2, (THUMB - dh) / 2, dw, dh);
  }, [bin, box, version]);

  return <canvas ref={ref} width={THUMB} height={THUMB} className="crop-thumb" aria-hidden="true" />;
}
