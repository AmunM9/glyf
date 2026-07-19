'use client';
import { useEffect, useId, useState } from 'react';
import type { Font } from 'opentype.js';
import { DEFAULT_TRACKING, withTracking } from '@/lib/fontSpacing';
import type { Copy } from '@/lib/strings';

interface Props {
  font: Font;
  tracking: number;
  onTrackingChange: (value: number) => void;
  t: Copy;
}

const MOBILE_PREVIEW_SIZE = 36;
const DESKTOP_PREVIEW_SIZE = 56;

export default function LivePreview({ font, tracking, onTrackingChange, t }: Props) {
  const [family, setFamily] = useState<string | null>(null);
  const [size, setSize] = useState(DESKTOP_PREVIEW_SIZE);
  const [text, setText] = useState(t.previewSample);
  const sizeSliderId = useId();
  const spacingSliderId = useId();

  useEffect(() => {
    if (window.matchMedia('(max-width: 480px)').matches) setSize(MOBILE_PREVIEW_SIZE);
  }, []);

  useEffect(() => {
    const exportFont = withTracking(font, tracking);
    const name = `glyf-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const face = new FontFace(name, exportFont.toArrayBuffer());
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
  }, [font, tracking]);

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
        <label htmlFor={sizeSliderId}>
          {t.sizeLabel} <span className="mono-value">{size}px</span>
        </label>
        <input
          id={sizeSliderId}
          type="range"
          min={20}
          max={120}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        />
        <label htmlFor={spacingSliderId}>
          {t.spacingLabel} <span className="mono-value">{Math.round(tracking * 100)}%</span>
        </label>
        <input
          id={spacingSliderId}
          type="range"
          min={65}
          max={150}
          step={1}
          value={Math.round(tracking * 100)}
          onChange={(e) => onTrackingChange(Number(e.target.value) / 100)}
        />
        <button type="button" className="btn" onClick={() => setText('')}>
          {t.clear}
        </button>
      </div>
    </div>
  );
}

export { DEFAULT_TRACKING };
