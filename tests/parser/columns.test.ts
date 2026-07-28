import { describe, it, expect } from 'vitest';
import { splitColumns } from '../../src/parser/columns';
import { twoRowPage, twoRowPageScaled } from '../fixtures/synthetic';

describe('splitColumns', () => {
  it('puts receiving codes left and sending codes right', () => {
    const { receiving, sending } = splitColumns(twoRowPage);

    expect(receiving.map((i) => i.text)).toContain('RECV 10');
    expect(receiving.map((i) => i.text)).toContain('RECV 20');
    expect(sending.map((i) => i.text)).toContain('SEND 1');
    expect(sending.map((i) => i.text)).toContain('No Course Articulated');
    expect(receiving.map((i) => i.text)).not.toContain('SEND 1');
  });

  it('keeps the receiving units column on the receiving side', () => {
    const { receiving, splitX } = splitColumns(twoRowPage);

    // The regression guard. A widest-gap split lands at 305 and drags this
    // item into the sending column, which mispairs every row after it.
    expect(receiving.filter((i) => i.x === 460)).toHaveLength(2);
    expect(splitX).toBeGreaterThan(460);
  });

  it('survives a different print scale', () => {
    const { splitX, receiving, sending } = splitColumns(twoRowPageScaled);

    expect(splitX).toBeGreaterThan(17 + 460 * 0.5);
    expect(splitX).toBeLessThan(17 + 540 * 0.5);
    expect(receiving.map((i) => i.text)).toContain('RECV 10');
    expect(sending.map((i) => i.text)).toContain('SEND 1');
  });
});
