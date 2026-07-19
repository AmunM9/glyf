'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Binarized } from '@/lib/preprocess';
import { readRegion, writeRegion, type Box } from '@/lib/segment';
import type { Copy } from '@/lib/strings';

interface Props {
  bin: Binarized;
  box: Box;
  t: Copy;
  // newBox = caja ajustada tras borrar; null = el recorte quedó vacío
  onApply: (newBox: Box | null) => void;
  onClose: () => void;
}

const MAX_UNDO = 30;

// Modal de limpieza: pinta para borrar tinta del recorte (motas, restos de
// rayas, objetos pequeños). Trabaja sobre una copia local; el mask real solo
// se toca al aplicar. Deshacer por trazo + restaurar original.
export default function GlyphEraser({ bin, box, t, onApply, onClose }: Props) {
  const [brush, setBrush] = useState(() => Math.max(2, Math.round(Math.max(box.w, box.h) * 0.06)));
  const [undoCount, setUndoCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<Uint8Array | null>(null);
  const initialRef = useRef<Uint8Array | null>(null);
  const undoRef = useRef<Uint8Array[]>([]);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const brushId = useId();

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const region = regionRef.current;
    if (!canvas || !region) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(box.w, box.h);
    for (let i = 0; i < region.length; i++) {
      const off = i * 4;
      if (region[i]) {
        img.data[off] = 232;
        img.data[off + 1] = 232;
        img.data[off + 2] = 224;
      } else {
        img.data[off] = 15;
        img.data[off + 1] = 15;
        img.data[off + 2] = 15;
      }
      img.data[off + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [box.w, box.h]);

  useEffect(() => {
    if (regionRef.current == null) {
      const r = readRegion(bin, box);
      regionRef.current = r;
      initialRef.current = r.slice();
    }
    redraw();
    dialogRef.current?.focus();
  }, [bin, box, redraw]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const { style } = document.body;
    const prev = {
      overflow: style.overflow,
      position: style.position,
      top: style.top,
      width: style.width,
    };

    style.overflow = 'hidden';
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.width = '100%';

    return () => {
      style.overflow = prev.overflow;
      style.position = prev.position;
      style.top = prev.top;
      style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  function toRegion(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * box.w,
      y: ((e.clientY - rect.top) / rect.height) * box.h,
    };
  }

  function eraseCircle(cx: number, cy: number): void {
    const region = regionRef.current;
    if (!region) return;
    const r = brush;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (x >= 0 && x < box.w && y >= 0 && y < box.h) region[y * box.w + x] = 0;
      }
    }
  }

  function eraseStroke(to: { x: number; y: number }): void {
    const from = lastPtRef.current ?? to;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
    for (let s = 0; s <= steps; s++) {
      eraseCircle(from.x + ((to.x - from.x) * s) / steps, from.y + ((to.y - from.y) * s) / steps);
    }
    lastPtRef.current = to;
    redraw();
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    const region = regionRef.current;
    if (!region) return;
    undoRef.current = [...undoRef.current.slice(-(MAX_UNDO - 1)), region.slice()];
    setUndoCount(undoRef.current.length);
    drawingRef.current = true;
    lastPtRef.current = null;
    eraseStroke(toRegion(e));
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (drawingRef.current) eraseStroke(toRegion(e));
  }

  function handleUp(): void {
    drawingRef.current = false;
    lastPtRef.current = null;
  }

  function undo(): void {
    const prev = undoRef.current.pop();
    if (!prev) return;
    regionRef.current = prev;
    setUndoCount(undoRef.current.length);
    redraw();
  }

  function reset(): void {
    const region = regionRef.current;
    const initial = initialRef.current;
    if (!region || !initial) return;
    undoRef.current = [...undoRef.current.slice(-(MAX_UNDO - 1)), region.slice()];
    setUndoCount(undoRef.current.length);
    regionRef.current = initial.slice();
    redraw();
  }

  function apply(): void {
    const region = regionRef.current;
    if (!region) return;
    onApply(writeRegion(bin, box, region));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t.eraserTitle}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2 className="modal-title">{t.eraserTitle}</h2>
        <p className="hint">{t.eraserHint}</p>
        <div className="eraser-stage">
          <canvas
            ref={canvasRef}
            width={box.w}
            height={box.h}
            className="eraser-canvas"
            style={{ aspectRatio: `${box.w} / ${box.h}` }}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
          />
        </div>
        <div className="eraser-controls">
          <label htmlFor={brushId}>
            {t.brushLabel} <span className="mono-value">{brush}px</span>
          </label>
          <input
            id={brushId}
            type="range"
            min={1}
            max={Math.max(4, Math.round(Math.max(box.w, box.h) * 0.2))}
            value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
          />
          <button type="button" className="btn btn-mini" onClick={undo} disabled={undoCount === 0}>
            {t.undo}
          </button>
          <button type="button" className="btn btn-mini" onClick={reset}>
            {t.reset}
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={apply}>
            {t.apply}
          </button>
        </div>
      </div>
    </div>
  );
}
