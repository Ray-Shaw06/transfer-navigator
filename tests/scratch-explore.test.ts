import { describe, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
const OUT = '/tmp/tn-explore.txt';
writeFileSync(OUT, '');
const LOG = (...a: unknown[]) => appendFileSync(OUT, a.join(' ') + '\n');

describe('explore', () => {
  it('looks', { timeout: 120000 }, async () => {
    const mod = await import('../src/assist/client');
    const all = (await mod.institutions()) as unknown as Record<string, unknown>[];
    LOG('INSTITUTION KEYS', JSON.stringify(Object.keys(all[0])));
    for (const s of all) {
      const names = (s.names ?? []) as Record<string, unknown>[];
      if (names.some((n) => /Humboldt|Hayward|Maritime/.test(String(n.name)))) {
        LOG('---', s.id, JSON.stringify(s, null, 1).slice(0, 2000));
      }
    }
    // How many institutions carry more than one visible name at all?
    let multi = 0;
    for (const s of all) {
      const vis = ((s.names ?? []) as Record<string, unknown>[]).filter((n) => !n.hideInList);
      if (vis.length > 1) multi += 1;
    }
    LOG('institutions with >1 visible name:', multi, 'of', all.length);
  });
});
