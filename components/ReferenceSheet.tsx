'use client';
import type { Copy } from '@/lib/strings';

export default function ReferenceSheet({ rows, t }: { rows: string[][]; t: Copy }) {
  return (
    <figure className="sheet" aria-label={t.sheetTitle}>
      <figcaption className="sheet-caption">{t.sheetHint}</figcaption>
      <div className="sheet-rows">
        {rows.map((row, i) => (
          <div className="sheet-row" key={i}>
            <span className="sheet-row-num" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
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
