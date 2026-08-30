'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

const LINKS = [
  { href: '/', label: 'Plan' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'How it works' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="masthead">
      <Link href="/" className="wordmark">
        <svg className="mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 20V6.5a2.5 2.5 0 0 1 2.5-2.5H19"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="5" cy="20" r="2.2" fill="currentColor" />
          <circle cx="19" cy="4" r="2.2" fill="currentColor" />
        </svg>
        Transfer Navigator
      </Link>

      <nav className="nav" aria-label="Sections">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link"
            aria-current={pathname === link.href ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <ThemeToggle />
    </header>
  );
}
