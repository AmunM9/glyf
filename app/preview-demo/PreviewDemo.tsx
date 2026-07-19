'use client';
import { useMemo, useState } from 'react';
import opentype from 'opentype.js';
import LivePreview, { DEFAULT_TRACKING } from '@/components/LivePreview';
import { STR } from '@/lib/strings';
import { withTracking } from '@/lib/fontSpacing';
import { downloadFont } from '@/lib/download';

function demoFont(): opentype.Font {
  const path = new opentype.Path();
  path.moveTo(80, 0);
  path.lineTo(320, 0);
  path.lineTo(320, 500);
  path.lineTo(80, 500);
  path.close();
  return new opentype.Font({
    familyName: 'GlyfDemo',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'space', unicode: 0x20, advanceWidth: 300, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 420, path }),
      new opentype.Glyph({ name: 'B', unicode: 66, advanceWidth: 420, path }),
    ],
  });
}

export default function PreviewDemo() {
  const font = useMemo(() => demoFont(), []);
  const [tracking, setTracking] = useState(DEFAULT_TRACKING);
  const t = STR.es;

  return (
    <main style={{ maxWidth: '60rem', margin: '0 auto', padding: '2rem 1rem' }}>
      <p className="hint" style={{ marginBottom: '1rem' }}>
        Demo local del paso 3 (solo desarrollo).
      </p>
      <section className="panel" aria-label={t.step3}>
        <LivePreview font={font} tracking={tracking} onTrackingChange={setTracking} t={t} />
        <div className="download-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => downloadFont(withTracking(font, tracking), 'Demo', 'ttf')}
          >
            {t.downloadTtf}
          </button>
        </div>
      </section>
    </main>
  );
}
