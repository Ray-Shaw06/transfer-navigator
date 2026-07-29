import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// pdfjs-dist only supplies a default workerSrc when it detects Node (see its
// own isNodeJS check); in a browser bundle GlobalWorkerOptions.workerSrc is
// left unset and getDocument throws. Point it at the worker script bundled
// alongside this module so the browser build works without reaching out to
// a CDN. This has no effect under Vitest's node environment, where pdfjs
// runs its Node fallback and ignores workerSrc.
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
}

export type TextItem = {
  text: string;
  x: number;
  y: number;
  page: number;
  pageWidth: number;
};

// Confirmed against a real ASSIST agreement PDF (scratch-spike.mjs, deleted after
// this task): pdfjs text content items have a `str` field and a `transform` array
// of six numbers, transform[4] is x and transform[5] is y. Matches the plan exactly.
export async function extractItems(data: Uint8Array): Promise<TextItem[]> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const items: TextItem[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const pageWidth = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();

    for (const raw of content.items as Array<{ str: string; transform: number[] }>) {
      const text = raw.str.trim();
      if (text) {
        items.push({ text, x: raw.transform[4], y: raw.transform[5], page: p, pageWidth });
      }
    }
  }
  return items;
}
