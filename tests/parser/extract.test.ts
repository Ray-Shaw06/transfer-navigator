import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { extractItems } from '../../src/parser/extract';

const FIXTURE = 'tests/fixtures/local/pcc-uci-cs-2025-2026.pdf';

describe.skipIf(!existsSync(FIXTURE))('extractItems', () => {
  it('returns items with coordinates and page numbers', async () => {
    const items = await extractItems(new Uint8Array(readFileSync(FIXTURE)));

    expect(items.length).toBeGreaterThan(100);
    expect(new Set(items.map((i) => i.page))).toEqual(new Set([1, 2, 3, 4, 5]));

    // Assert structurally rather than on a specific course code, so the test
    // does not embed real agreement content and does not break when the
    // fixture is a different agreement.
    const codeLike = items.find((i) => /^[A-Z&][A-Z0-9&]*\s\d+[A-Z]*$/.test(i.text));
    expect(codeLike).toBeDefined();
    expect(Number.isFinite(codeLike!.x)).toBe(true);
    expect(Number.isFinite(codeLike!.y)).toBe(true);
    expect(items.every((i) => Number.isFinite(i.pageWidth) && i.pageWidth > 0)).toBe(true);
  });
});
