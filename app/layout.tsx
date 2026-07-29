import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Transfer Navigator',
  description:
    'Upload your ASSIST articulation agreement and see what you still need to transfer. Everything runs in your browser: the file is never uploaded.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
