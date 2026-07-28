import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { extractItems } from '../../src/parser/extract';

const FIXTURE = 'tests/fixtures/local/pcc-uci-cs-2025-2026.pdf';

describe.skipIf(!existsSync(FIXTURE))('extractItems', () => {
  it('returns items with coordinates and page numbers', async () => {
    const items = await extractItems(new Uint8Array(readFileSync(FIXTURE)));

    expect(items.length).toBeGreaterThan(100);
    expect(new Set(items.map((i) => i.page))).toEqual(new Set([1, 2, 3, 4, 5]));

    const target = items.find((i) => i.text.includes('I&C SCI 6D'));
    expect(target).toBeDefined();
    expect(Number.isFinite(target!.x)).toBe(true);
    expect(Number.isFinite(target!.y)).toBe(true);
  });
});
