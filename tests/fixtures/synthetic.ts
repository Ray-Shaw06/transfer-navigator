import type { TextItem } from '../../src/parser/extract';

// One page, two rows. Left column near x=50, right column near x=550.
// RECV 10 is satisfied by SEND 1 AND SEND 1L. RECV 20 has nothing articulated.
// The x values deliberately mirror the real agreement's trap: the widest gap
// here is 150 to 460, inside the LEFT column, not between the columns.
const W = 1000;
const at = (text: string, x: number, y: number): TextItem => ({
  text,
  x,
  y,
  page: 1,
  pageWidth: W,
});

export const twoRowPage: TextItem[] = [
  at('RECV 10', 50, 700),
  at('Intro to Widgets', 150, 700),
  at('4.00', 460, 700),
  at('SEND 1', 550, 712),
  at('Widget Fundamentals', 650, 712),
  at('3.00', 950, 712),
  at('AND', 540, 690),
  at('SEND 1L', 550, 668),
  at('Widget Fundamentals Lab', 650, 668),
  at('1.00', 950, 668),
  at('RECV 20', 50, 600),
  at('Advanced Widgets', 150, 600),
  at('4.00', 460, 600),
  at('No Course Articulated', 550, 600),
];

// The same page printed at a different scale and offset, which is what a
// different browser or paper size produces. pageWidth scales with it.
export const twoRowPageScaled: TextItem[] = twoRowPage.map((i) => ({
  ...i,
  x: i.x * 0.5 + 17,
  pageWidth: W * 0.5 + 17,
}));
