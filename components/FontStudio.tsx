'use client';
import { useCallback, useId, useState } from 'react';
import type { Font } from 'opentype.js';
import { getRows, type Lang } from '@/lib/charset';
import { STR } from '@/lib/strings';
import { preprocess, type Binarized } from '@/lib/preprocess';
import { NoInkError, RowCountError, segmentSheet, type SegRow } from '@/lib/segment';
import { vectorizeCrop } from '@/lib/vectorize';
import { buildGlyfFont, type GlyphSource } from '@/lib/buildFont';
import { downloadFont } from '@/lib/download';
import ReferenceSheet from './ReferenceSheet';
import Uploader from './Uploader';
import GlyphReview, { type GlyphPick } from './GlyphReview';
import LivePreview from './LivePreview';
import LaserField from './LaserField';

type Stage = 'pre' | 'seg' | 'vec' | 'build';

interface Progress {
  stage: Stage;
  done: number;
  total: number;
}

const STAGES: Stage[] = ['pre', 'seg', 'vec', 'build'];

export default function FontStudio() {
  const [lang, setLang] = useState<Lang>('es');
  const [familyName, setFamilyName] = useState('MiFuente');
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [bin, setBin] = useState<Binarized | null>(null);
  const [segRows, setSegRows] = useState<SegRow[] | null>(null);
  const [lastPicks, setLastPicks] = useState<GlyphPick[] | null>(null);
  const [font, setFont] = useState<Font | null>(null);

  const t = STR[lang];
  const rows = getRows(lang);
  const nameId = useId();
  const family = familyName.trim() || 'MiFuente';

  const stageLabel: Record<Stage, string> = {
    pre: t.stagePre,
    seg: t.stageSeg,
    vec: t.stageVec,
    build: t.stageBuild,
  };

  const finalize = useCallback(
    async (b: Binarized, picks: GlyphPick[]) => {
      setError(null);
      // guarda la asignación confirmada y sincroniza las cajas: al volver de
      // [04] a [03] la revisión se prellena con exactamente lo que se confirmó
      setLastPicks(picks);
      setSegRows((prev) =>
        prev
          ? prev.map((r, ri) => ({
              ...r,
              boxes: picks
                .filter((p) => p.rowIndex === ri)
                .map((p) => p.box)
                .sort((a, b) => a.x - b.x),
            }))
          : prev,
      );
      setProgress({ stage: 'vec', done: 0, total: picks.length });
      try {
        const sources: GlyphSource[] = [];
        for (let i = 0; i < picks.length; i++) {
          sources.push({ ...picks[i], contours: await vectorizeCrop(b, picks[i].box) });
          // ponytail: sin Web Worker; ceder el hilo cada 4 glifos evita congelar
          // la UI. Mejora = worker/process.worker.ts si el charset crece.
          if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
          setProgress({ stage: 'vec', done: i + 1, total: picks.length });
        }
        setProgress({ stage: 'build', done: 0, total: 1 });
        await new Promise((r) => setTimeout(r, 0));
        const result = buildGlyfFont(sources, { familyName: family });
        setFont(result.font);
        setWarnings(result.warnings);
        setProgress(null);
        setStep(4);
      } catch (e) {
        console.warn('[glyf] finalize', e);
        setProgress(null);
        setError(t.errGeneric);
      }
    },
    [family, t],
  );

  async function handleFile(file: File) {
    setError(null);
    setWarnings([]);
    try {
      setProgress({ stage: 'pre', done: 0, total: 1 });
      await new Promise((r) => setTimeout(r, 30)); // deja pintar el estado
      const b = await preprocess(file);
      setProgress({ stage: 'seg', done: 0, total: 1 });
      await new Promise((r) => setTimeout(r, 0));
      const seg = segmentSheet(b, rows.map((r) => r.length));
      setBin(b);
      setSegRows(seg);
      const mismatched = seg
        .map((r, i) => ({ i, found: r.boxes.length, want: rows[i].length }))
        .filter((r) => r.found !== r.want);
      if (mismatched.length > 0) {
        // FALLO→SOLUCIÓN: nunca asignar a ciegas con conteos descuadrados;
        // eso corre todos los caracteres y arruina la fuente entera.
        setProgress(null);
        setError(mismatched.map((m) => t.errRowShort(m.i + 1, m.found, m.want)).join(' '));
        setStep(3);
        return;
      }
      await finalize(
        b,
        seg.flatMap((r, ri) => r.boxes.map((box, ci) => ({ char: rows[ri][ci], rowIndex: ri, box }))),
      );
    } catch (e) {
      console.warn('[glyf] pipeline', e);
      setProgress(null);
      if (e instanceof RowCountError) setError(t.errRows(e.found, e.want));
      else if (e instanceof NoInkError) setError(t.errNoInk);
      else setError(t.errGeneric);
    }
  }

  function restart() {
    setStep(1);
    setError(null);
    setWarnings([]);
    setBin(null);
    setSegRows(null);
    setLastPicks(null);
    setFont(null);
    setProgress(null);
  }

  const stepTitles = [t.step1, t.step2, t.step3, t.step4];

  return (
    <div className="studio">
      <header className="studio-header">
        <h1 className="brand">
          <span className="brand-bracket">[</span>glyf<span className="brand-bracket">]</span>
          <span className="brand-cursor" aria-hidden="true" />
        </h1>
        <p className="tagline">{t.tagline}</p>
        <nav className="lang-switch" aria-label={t.langLabel}>
          {(['es', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={`btn btn-mini${lang === l ? ' is-active' : ''}`}
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </nav>
      </header>

      <ol className="steps-nav" aria-label="progreso">
        {stepTitles.map((title, i) => (
          <li key={title} className={`step-tag${step === i + 1 ? ' is-current' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="step-num">[{String(i + 1).padStart(2, '0')}]</span> {title}
          </li>
        ))}
      </ol>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {step === 1 && (
        <section className="panel" aria-label={t.step1}>
          <div className="field">
            <label htmlFor={nameId}>{t.fontNameLabel}</label>
            <input
              id={nameId}
              type="text"
              value={familyName}
              maxLength={40}
              onChange={(e) => setFamilyName(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
            {t.continue_}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="panel" aria-label={t.step2}>
          <ReferenceSheet rows={rows} t={t} />
          <div className="process-zone">
            <LaserField active={progress !== null} />
            {progress ? (
              <div className="progress" role="status" aria-live="polite">
                {STAGES.map((s) => {
                  const idx = STAGES.indexOf(progress.stage);
                  const mine = STAGES.indexOf(s);
                  const state = mine < idx ? 'done' : mine === idx ? 'active' : 'todo';
                  return (
                    <span key={s} className={`progress-stage is-${state}`}>
                      {stageLabel[s]}
                      {s === 'vec' && state === 'active'
                        ? ` ${progress.done}/${progress.total}`
                        : ''}
                    </span>
                  );
                })}
                <span className="progress-bar" aria-hidden="true">
                  <span
                    className="progress-fill"
                    style={{
                      width: `${
                        ((STAGES.indexOf(progress.stage) +
                          (progress.total ? progress.done / progress.total : 0)) /
                          STAGES.length) *
                        100
                      }%`,
                    }}
                  />
                </span>
              </div>
            ) : (
              <Uploader onFile={handleFile} disabled={progress !== null} t={t} />
            )}
          </div>
          <button type="button" className="btn" onClick={() => setStep(1)} disabled={progress !== null}>
            {t.back}
          </button>
        </section>
      )}

      {step === 3 && bin && segRows && (
        <section className="panel" aria-label={t.step3}>
          <GlyphReview
            bin={bin}
            segRows={segRows}
            expectedRows={rows}
            initialPicks={lastPicks}
            t={t}
            onBack={() => {
              setError(null);
              setStep(2);
            }}
            onConfirm={(picks) => finalize(bin, picks)}
          />
          {progress && (
            <p className="progress-inline" role="status" aria-live="polite">
              {stageLabel[progress.stage]} {progress.done}/{progress.total}
            </p>
          )}
        </section>
      )}

      {step === 4 && font && (
        <section className="panel" aria-label={t.step4}>
          <LivePreview font={font} t={t} />
          {warnings.length > 0 && (
            <details className="warnings">
              <summary>
                {t.warnings} ({warnings.length})
              </summary>
              <ul>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="download-actions">
            <button type="button" className="btn btn-primary" onClick={() => downloadFont(font, family, 'ttf')}>
              {t.downloadTtf}
            </button>
            <button type="button" className="btn" onClick={() => downloadFont(font, family, 'otf')}>
              {t.downloadOtf}
            </button>
            {bin && segRows && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setError(null);
                  setStep(3);
                }}
              >
                {t.backToReview}
              </button>
            )}
            <button type="button" className="btn" onClick={restart}>
              {t.restart}
            </button>
          </div>
        </section>
      )}

      <footer className="studio-footer">
        <p className="credibility">{t.pipeline}</p>
      </footer>
    </div>
  );
}
