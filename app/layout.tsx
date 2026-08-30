import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Nav } from './components/Nav';

// One family carries headings, labels, data and prose, which is what product
// UI wants. The mono is not a second voice: it is used only for course codes,
// which a student scans against a registration screen and reads aloud to a
// counsellor, so consistent glyph width is doing real work.
//
// next/font self-hosts both at build time. No CDN request, no layout shift.
const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600'],
  variable: '--font-mono',
});

export const metadata = {
  title: 'Transfer Navigator',
  description:
    'Pick your California community college, where you want to transfer, and your major. See exactly what you still need, term by term, straight from the ASSIST articulation agreement.',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#12172b' },
    { media: '(prefers-color-scheme: light)', color: '#f4f5fa' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="shell">
          <Nav />
          {children}
          <footer className="site-footer">
            <p>
              Not affiliated with ASSIST, the University of California, the California State
              University, or any college. Agreement data comes from{' '}
              <a href="https://assist.org" target="_blank" rel="noreferrer">
                assist.org
              </a>
              , which is the official source and the one to trust if this ever disagrees with it.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
