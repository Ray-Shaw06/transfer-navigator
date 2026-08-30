// Builds small, syntactically valid PDFs carrying text at chosen coordinates,
// so the parser can be exercised end to end, through pdfjs, on something this
// repo is allowed to commit.
//
// Why hand-rolled rather than a library: the parser's whole job is reading
// structure out of text positions, so the fixture has to control those
// positions exactly. A generator is also the only honest option here, since
// this project does not commit real ASSIST agreements, and the eight tests
// that check the parser against a real one are gitignored and skip in CI.
//
// Byte offsets in the xref table are computed as objects are appended rather
// than typed by hand, so there is nothing to get wrong by miscounting.

export type Item = { text: string; x: number; y: number };
export type Page = Item[];

const escape = (text: string) => text.replace(/([()\\])/g, '\\$1');

// One page's content stream. Each item gets its own text object so the
// coordinates are absolute rather than relative to whatever ran before it.
function contentStream(items: Item[]): string {
  return items
    .map((i) => `BT /F1 10 Tf ${i.x} ${i.y} Td (${escape(i.text)}) Tj ET`)
    .join('\n');
}

export function makePdf(pages: Page[]): Uint8Array {
  // Object numbering: 1 catalog, 2 pages, 3 font, then a page object and a
  // content object per page, interleaved.
  const pageFirstObject = 4;
  const pageIds = pages.map((_, i) => pageFirstObject + i * 2);
  const contentIds = pageIds.map((id) => id + 1);

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  pages.forEach((items, index) => {
    const stream = contentStream(items);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentIds[index]} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

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

// Column x positions matching an ASSIST agreement's two-column layout: the
// receiving campus on the left, the sending college on the right, with a wide
// corridor between them for splitColumns to find.
export const RECV_X = 60;
export const SEND_X = 330;

export const recv = (text: string, y: number): Item => ({ text, x: RECV_X, y });
export const send = (text: string, y: number): Item => ({ text, x: SEND_X, y });
