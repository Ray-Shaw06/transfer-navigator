import { describe, it, expect } from 'vitest';
import { CATALOGS, catalogFor } from '../../src/catalog/registry';

describe('the catalog registry', () => {
  it('holds one entry per college', () => {
    const ids = CATALOGS.map((c) => c.college);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lets a district catalog serve every college in it', () => {
    // Moorpark, Oxnard and Ventura are one district publishing one catalog,
    // whose courses carry the district's own M prefix and whose prerequisites
    // are stated district-wide. Three colleges sharing a host is correct here,
    // so the registry must not require hosts to be unique.
    const vcccd = CATALOGS.filter((c) => c.host === 'catalog.vcccd.edu');
    expect(vcccd.map((c) => c.college).sort((a, b) => a - b)).toEqual([87, 95, 139]);
  });

  it('has no college without a host, or host without a college', () => {
    for (const entry of CATALOGS) {
      expect(entry.college).toBeGreaterThan(0);
      // A CourseLeaf host is the college's own .edu; an eLumen host is the
      // tenant name on eLumen's domain.
      expect(entry.host).toMatch(
        entry.platform === 'elumen' ? /^[a-z0-9-]+\.elumenapp\.com$/ : /^[a-z0-9.-]+\.edu$/,
      );
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

describe('a pinned eLumen site', () => {
  it('is only ever set on an eLumen entry', () => {
    // `site` means nothing to a CourseLeaf reader, and one set there would be
    // a sign the entry was copied from the wrong template.
    for (const entry of CATALOGS) {
      if (entry.site !== undefined) expect(entry.platform).toBe('elumen');
    }
  });
});

describe('a district catalog with a college prefix', () => {
  it('lets Cypress and Fullerton share a host with their own subject pages', () => {
    const nocccd = CATALOGS.filter((c) => c.host === 'catalog.nocccd.edu');
    expect(nocccd.map((c) => c.college).sort((a, b) => a - b)).toEqual([71, 134]);
    expect(new Set(nocccd.map((c) => c.subjectPage)).size).toBe(2);
  });

  it('never marks a college subject-page-only without a subject page', () => {
    for (const entry of CATALOGS) {
      if (entry.subjectPageOnly) expect(entry.subjectPage).toBeTruthy();
    }
  });
});
