import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Transfer Navigator',
  description:
    'Pick your California community college, where you want to transfer, and your major. See exactly what you still need, straight from the ASSIST articulation agreement.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
