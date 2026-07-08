'use client';
import { useEffect, useId, useState } from 'react';
import type { Font } from 'opentype.js';
import type { Copy } from '@/lib/strings';

interface Props {
  font: Font;
  t: Copy;
}

export default function LivePreview({ font, t }: Props) {
  const [family, setFamily] = useState<string | null>(null);
  const [size, setSize] = useState(56);
  const [text, setText] = useState(t.previewSample);
  const sliderId = useId();

  useEffect(() => {
    // FALLO→SOLUCIÓN: familia única por generación; la caché de FontFace del
    // navegador no refresca una familia ya registrada al regenerar.
    const name = `glyf-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const face = new FontFace(name, font.toArrayBuffer());
    let alive = true;
    face
      .load()
      .then(() => {
        if (!alive) return;
        document.fonts.add(face);
        setFamily(name);
      })
      .catch(() => setFamily(null));
    return () => {
      alive = false;
      document.fonts.delete(face);
    };
  }, [font]);

  return (
    <div className="preview">
      <textarea
        className="preview-area"
        aria-label={t.previewPlaceholder}
        placeholder={t.previewPlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ fontFamily: family ? `'${family}', monospace` : undefined, fontSize: `${size}px` }}
        rows={4}
        spellCheck={false}
      />
      <div className="preview-controls">
        <label htmlFor={sliderId}>
          {t.sizeLabel} <span className="mono-value">{size}px</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={24}
          max={120}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        />
        <button type="button" className="btn" onClick={() => setText('')}>
          {t.clear}
        </button>
      </div>
    </div>
  );
}
