'use client';
import { useRef, useState } from 'react';
import type { Copy } from '@/lib/strings';

interface Props {
  onFile: (file: File) => void;
  disabled: boolean;
  t: Copy;
}

export default function Uploader({ onFile, disabled, t }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (f && f.type.startsWith('image/')) onFile(f);
  }

  return (
    <div
      className={`uploader${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
    >
      <p className="uploader-hint">{t.dropHint}</p>
      <div className="uploader-actions">
        <button type="button" className="btn" disabled={disabled} onClick={() => fileRef.current?.click()}>
          {t.browse}
        </button>
        <button type="button" className="btn" disabled={disabled} onClick={() => cameraRef.current?.click()}>
          {t.camera}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        aria-label={t.browse}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        aria-label={t.camera}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
