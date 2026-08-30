'use client';

import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

// Reads in a library at night and outside between classes, and the system
// setting is frequently wrong for one of them. Stored per browser; it never
// leaves the device and nothing here depends on it being readable.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tn-theme');
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    } catch {
      // Private windows and blocked site data both throw here. The system
      // setting is a perfectly good answer, so there is nothing to recover.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    try {
      if (theme === 'system') localStorage.removeItem('tn-theme');
      else localStorage.setItem('tn-theme', theme);
    } catch {
      // Same as above: the toggle still works for this visit.
    }
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={`Theme: ${LABEL[theme]}. Click to change.`}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {theme === 'dark' ? (
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ) : theme === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
          </>
        )}
      </svg>
      {LABEL[theme]}
    </button>
  );
}
