'use client';
// FALLO→SOLUCIÓN SSR: opentype.js / imagetracerjs / canvas son solo de
// navegador; ssr:false exige un Client Component, por eso la página lo es.
import dynamic from 'next/dynamic';

const FontStudio = dynamic(() => import('@/components/FontStudio'), {
  ssr: false,
  loading: () => (
    <p className="boot" role="status">
      [glyf] loading…
    </p>
  ),
});

export default function Page() {
  return (
    <main>
      <FontStudio />
    </main>
  );
}
