import Link from 'next/link';
import LaserField from './LaserField';

const STEPS = [
  { n: '01', title: 'cartilla + foto', body: 'Copia la cartilla a mano y sube una sola foto. Ni impresora ni escáner.' },
  { n: '02', title: 'revisión de letras', body: 'glyf recorta cada letra, endereza el papel y descarta rayas o ruido.' },
  { n: '03', title: 'escribe y descarga', body: 'Prueba tu fuente en el momento y descárgala en .ttf o .otf.' },
];

const FEATURES = [
  { title: 'cero subida', body: 'Todo el procesamiento corre en tu navegador. Ninguna foto sale de tu dispositivo.' },
  { title: 'papel real', body: 'Funciona con papel blanco, rayado o cuadriculado, foto torcida o con mesa de fondo.' },
  { title: 'orientación automática', body: 'Detecta y corrige fotos giradas o al revés, sin que tengas que hacer nada.' },
  { title: 'revisión editable', body: 'Si una letra sale mal, la reasignas, la divides o borras la imperfección a mano.' },
];

export default function Landing() {
  return (
    <main className="landing">
      <div className="hero-bg-image" aria-hidden="true" />
      <header className="landing-hero">
        <LaserField active />
        <div className="landing-hero-content">
          <p className="brand">
            <span className="brand-bracket">[</span>glyf<span className="brand-bracket">]</span>
            <span className="brand-cursor" aria-hidden="true" />
          </p>
          <h1 className="hero-title">tu letra, convertida en una fuente real</h1>
          <p className="hero-sub">
            Sube una foto de tu escritura a mano. glyf la convierte en una fuente tipográfica que
            puedes instalar y usar donde quieras — sin subir nada a ningún servidor.
          </p>
          <Link href="/studio" className="btn btn-primary btn-hero">
            crear mi fuente →
          </Link>
          <p className="credibility">pipeline: Otsu → deskew → imagetracer → opentype.js · client-side · zero upload</p>
        </div>
      </header>

      <section className="landing-section" aria-labelledby="how-heading">
        <h2 id="how-heading" className="section-label">
          [01] cómo funciona
        </h2>
        <div className="steps-grid">
          {STEPS.map((s) => (
            <div className="step-card" key={s.n}>
              <span className="step-card-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section" aria-labelledby="why-heading">
        <h2 id="why-heading" className="section-label">
          [02] por qué funciona
        </h2>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-heading">
        <h2 id="cta-heading" className="section-label">
          [03] empieza ahora
        </h2>
        <Link href="/studio" className="btn btn-primary btn-hero">
          crear mi fuente →
        </Link>
      </section>

      <footer className="landing-footer">
        <p className="brand-small">
          <span className="brand-bracket">[</span>glyf<span className="brand-bracket">]</span>
        </p>
        <p className="credibility">type from a photo</p>
      </footer>
    </main>
  );
}
