import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseAgreement, UnrecognisedAgreementError } from '../../src/parser/document';

const FIXTURE = 'tests/fixtures/local/pcc-uci-cs-2025-2026.pdf';

// Builds the smallest syntactically valid single page PDF pdfjs will open,
// carrying one line of text on that page. Byte offsets in the xref table are
// computed here rather than typed by hand, so there is nothing to get wrong
// by miscounting: each object's start offset is recorded as it is appended,
// and the xref entries are formatted to the exact 20 bytes the PDF spec
// requires per entry.
function makeTextPdf(text: string): Uint8Array {
  const escaped = text.replace(/([()\\])/g, '\\$1');
  const stream = `BT /F1 12 Tf 72 712 Td (${escaped}) Tj ET`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

describe('parseAgreement on input that is not an agreement', () => {
  it('throws rather than returning an empty agreement', async () => {
    // A minimal valid PDF carrying one line of unrelated text.
    const pdf = makeTextPdf('This is not an articulation agreement.');
    await expect(parseAgreement(pdf)).rejects.toThrow(UnrecognisedAgreementError);
  });
});

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
