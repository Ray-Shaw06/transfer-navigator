import { describe, it, expect } from 'vitest';
import { CATALOGS, catalogFor } from '../../src/catalog/registry';

describe('the catalog registry', () => {
  it('holds one entry per college', () => {
    const ids = CATALOGS.map((c) => c.college);
    expect(new Set(ids).size).toBe(ids.length);
    const hosts = CATALOGS.map((c) => c.host);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it('has no college without a host, or host without a college', () => {
    for (const entry of CATALOGS) {
      expect(entry.college).toBeGreaterThan(0);
      expect(entry.host).toMatch(/^[a-z0-9.-]+\.edu$/);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it('returns nothing for a college it cannot read, rather than a guess', () => {
    // The failure this prevents is silent and severe: an id that is off by
    // one points a student at another college's catalog and orders their plan
    // by prerequisites that are not theirs. Every id here was read back from
    // ASSIST's own institution list rather than guessed, and a college with
    // no entry has to fall through to reading order from course numbers.
    expect(catalogFor(999)).toBeNull();
    expect(catalogFor(49)?.host).toBe('curriculum.pasadena.edu');
  });
});
