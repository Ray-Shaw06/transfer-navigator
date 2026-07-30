export type SectionRule = { kind: 'all' } | { kind: 'choose'; least: number };
export type Section = { label: string; rule: SectionRule };

// Headers carry a leading section number. "Select A or B" is the same rule as
// "Complete at least 1", so both collapse to choose with least 1 rather than
// becoming two concepts.
const NUMBERED = /^(\d+)\s+(.+)$/;
const AT_LEAST = /^Complete at least (\d+) courses? from the following$/i;
const SELECT_BETWEEN = /^Select\s+[A-Z](?:\s+or\s+[A-Z])+$/i;

export function parseSectionHeader(text: string): Section | null {
  const trimmed = text.trim();

  if (/^REQUIRED FOR ADMISSION$/i.test(trimmed)) {
    return { label: trimmed, rule: { kind: 'all' } };
  }

  const numbered = NUMBERED.exec(trimmed);
  if (!numbered) return null;

  const label = numbered[2].trim();

  const atLeast = AT_LEAST.exec(label);
  if (atLeast) return { label, rule: { kind: 'choose', least: Number(atLeast[1]) } };

  if (SELECT_BETWEEN.test(label)) return { label, rule: { kind: 'choose', least: 1 } };

  return null;
}
