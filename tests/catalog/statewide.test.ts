import { describe, it, expect } from 'vitest';
import { statewideCandidates } from '../../src/catalog/statewide';
import { formerlyCodes } from '../../src/catalog/text';

describe('statewideCandidates', () => {
  it('names the statewide codes an old economics course may now live under', () => {
    expect(statewideCandidates('ECON 1B')).toEqual(['ECON C2001', 'ECON C2002']);
    expect(statewideCandidates('ECON- 102')).toEqual(['ECON C2001', 'ECON C2002']);
  });

  it('maps a college\'s own subject spelling onto the statewide one', () => {
    // Mission writes ECN 001A; the statewide course is ECON C2001 there too.
    expect(statewideCandidates('ECN 001A')).toEqual(['ECON C2001', 'ECON C2002']);
    expect(statewideCandidates('POLSC 1')).toEqual(['POLS C1000']);
  });

  it('has nothing to offer a subject the state has not renumbered', () => {
    expect(statewideCandidates('CHEM 1A')).toEqual([]);
    expect(statewideCandidates('CS 003A')).toEqual([]);
  });
});

describe('formerlyCodes', () => {
  it('reads the old code however the catalog writes it', () => {
    // Foothill, Victor Valley, Antelope Valley and Diablo Valley, as written.
    expect(formerlyCodes('Formerly: ECON 1B An introductory course')).toEqual(['ECON 1B']);
    expect(formerlyCodes('...and the impact of policies. Formerly ECON 102. .')).toEqual(['ECON 102']);
    expect(formerlyCodes('Formerly ECON 102 (C-ID: ECON 201) (UC, CSU, AVC)')).toEqual(['ECON 102']);
    expect(formerlyCodes('Formerly ECON-221 (26-27) --> Requisites: None')).toEqual(['ECON 221']);
    // Mission, Modesto and Marin, as written.
    expect(formerlyCodes('formerly known as ECN 001B Toggle Transferability')).toEqual(['ECN 001B']);
    expect(formerlyCodes('Formerly listed as ECON 102')).toEqual(['ECON 102']);
    expect(formerlyCodes('formerly ECON 102, AA/AS Area B, CSU Area D')).toEqual(['ECON 102']);
  });

  it('reads nothing where nothing was renumbered', () => {
    expect(formerlyCodes('An introductory course in programming using Python.')).toEqual([]);
  });
});
