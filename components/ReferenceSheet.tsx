'use client';
import type { Copy } from '@/lib/strings';

export default function ReferenceSheet({ rows, t }: { rows: string[][]; t: Copy }) {
  return (
    <figure className="sheet" aria-label={t.sheetTitle}>
      <figcaption className="sheet-caption">{t.sheetHint}</figcaption>
      <div className="sheet-rows">
        {rows.map((row, i) => (
          // sin números de fila: cualquier marca dentro de la "hoja" invita a
          // copiarla a mano; los renglones punteados ya marcan la estructura
          <div className="sheet-row" key={i}>
            {row.map((c) => (
              <span className="sheet-char" key={c}>
                {c}
              </span>
            ))}
          </div>
        ))}
      </div>
    </figure>
  );
}
