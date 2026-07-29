import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseAgreement } from '../../src/parser/document';

const FIXTURE = 'tests/fixtures/local/pcc-uci-cs-2025-2026.pdf';

describe.skipIf(!existsSync(FIXTURE))('parseAgreement, real PCC to UCI CS 2025-2026', () => {
  it('reads the header', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    expect(agreement.academicYear).toBe('2025-2026');
    expect(agreement.major).toBe('Computer Science, B.S.');
    expect(agreement.receivingInstitution).toContain('Irvine');
    expect(agreement.sendingInstitution).toContain('Pasadena');
  });

  it('finds the four cells with nothing articulated', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const blanks = agreement.rows
      .filter((r) => r.sending.kind === 'not_articulated')
      .flatMap((r) => r.receiving.map((c) => c.code));

    expect(blanks).toEqual(
      expect.arrayContaining(['I&C SCI 53', 'IN4MATX 43', 'STATS 67', 'I&C SCI 6N']),
    );
  });

  it('pairs I&C SCI 51 with the machine organization pair', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const row = agreement.rows.find((r) => r.receiving.some((c) => c.code === 'I&C SCI 51'));

    expect(row).toBeDefined();
    expect(row!.sending.kind).toBe('options');
    if (row!.sending.kind !== 'options') return;
    expect(row!.sending.options[0].courses.map((c) => c.code)).toEqual(['CS 066', 'CS 066L']);
  });

  it('reads the four-alternative programming requirement', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const row = agreement.rows.find((r) => r.receiving.some((c) => c.code === 'I&C SCI 31'));

    expect(row!.sending.kind).toBe('options');
    if (row!.sending.kind !== 'options') return;
    expect(row!.sending.options).toHaveLength(4);
  });

  it('leaves no row unreadable', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const unreadable = agreement.rows.filter((r) => r.sending.kind === 'unreadable');
    expect(unreadable).toEqual([]);
  });

  it('marks the two routes through the linear algebra requirement as one group', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));

    const sixN = agreement.rows.find((r) => r.receiving.some((c) => c.code === 'I&C SCI 6N'));
    const threeA = agreement.rows.find((r) => r.receiving.some((c) => c.code === 'MATH 3A'));

    expect(sixN).toBeDefined();
    expect(threeA).toBeDefined();
    expect(sixN!.orGroup).toBeDefined();
    expect(sixN!.orGroup).toBe(threeA!.orGroup);
  });

  it('leaves independent requirements without a group', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const row = agreement.rows.find((r) => r.receiving.some((c) => c.code === 'I&C SCI 51'));

    expect(row!.orGroup).toBeUndefined();
  });
});
