import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: '[glyf]',
  description:
    'type from a photo — genera una fuente .ttf desde una sola foto de tu letra, 100% en tu navegador.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={mono.variable}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
