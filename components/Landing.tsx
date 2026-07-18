import Link from 'next/link';
import LaserField from './LaserField';

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
            puedes instalar y usar donde quieras.
          </p>
          <Link href="/studio" className="btn btn-primary btn-hero">
            crear mi fuente →
          </Link>
          <p className="credibility">pipeline: Otsu → deskew → imagetracer → opentype.js · client-side · zero upload</p>
        </div>
      </header>

      <footer className="landing-footer">
        <p className="brand-small">
          <span className="brand-bracket">[</span>glyf<span className="brand-bracket">]</span>
        </p>
        <p className="credibility">type from a photo</p>
      </footer>
    </main>
  );
}
