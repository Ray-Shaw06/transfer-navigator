import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// pdfjs reaches for DOMMatrix when its module is evaluated, and DOMMatrix
// does not exist in a serverless Node runtime. A server route that pulled it
// in, even only to name an error class defined in the same file as the
// parser, crashed with "ReferenceError: DOMMatrix is not defined" before it
// ran a line of its own. Nothing failed locally and nothing failed at build
// time; it failed in production only.
//
// So this walks what each route actually imports and refuses to let pdfjs
// back onto that path. Type-only imports are erased and cannot drag a module
// in at runtime, so they are skipped the same way the compiler skips them.

const ROOT = resolve(__dirname, '../..');

const ENTRY_POINTS = [
  'app/api/assist/institutions/route.ts',
  'app/api/assist/majors/route.ts',
  'app/api/assist/agreement/route.ts',
  'app/api/assist/partners/route.ts',
];

const IMPORT = /^\s*import\s+(type\s+)?([^;]*?)\s*from\s*['"]([^'"]+)['"]/gm;

function resolveModule(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// Every module reachable at runtime from `entry`, plus every bare specifier
// it would load. `import type` is skipped; so is a named clause where every
// binding is individually marked `type`.
function walk(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [resolve(ROOT, entry)];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT)) {
      const [, typeKeyword, clause, specifier] = match;
      if (typeKeyword) continue;

      const bindings = clause.trim();
      const named = bindings.startsWith('{') && bindings.endsWith('}');
      if (named) {
        const parts = bindings
          .slice(1, -1)
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 0 && parts.every((p) => p.startsWith('type '))) continue;
      }

      const resolved = resolveModule(file, specifier);
      if (resolved) queue.push(resolved);
      else if (!specifier.startsWith('.')) packages.add(specifier);
    }
  }

  return { files, packages };
}

describe('server routes', () => {
  it.each(ENTRY_POINTS)('%s never loads pdfjs at runtime', (entry) => {
    const { files, packages } = walk(entry);

    expect([...packages].filter((p) => p.includes('pdfjs'))).toEqual([]);
    expect([...files].filter((f) => f.endsWith('src/parser/extract.ts'))).toEqual([]);
    expect([...files].filter((f) => f.endsWith('src/parser/document.ts'))).toEqual([]);
  });

  it('still reaches the mapper and the client it needs', () => {
    const { files } = walk('app/api/assist/agreement/route.ts');
    const names = [...files].map((f) => f.slice(ROOT.length + 1));
    expect(names).toContain('src/assist/agreement.ts');
    expect(names).toContain('src/assist/client.ts');
  });
});
