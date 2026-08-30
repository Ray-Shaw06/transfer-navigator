'use client';

export type Option = { id: number; name: string; system?: string };
export type YearOption = { id: number; label: string };
export type MajorOption = { label: string; key: string };

type Props = {
  colleges: Option[];
  campuses: Option[];
  years: YearOption[];
  majors: MajorOption[];
  college: number | null;
  campus: number | null;
  year: number | null;
  major: string | null;
  majorsState: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  onCollege: (id: number | null) => void;
  onCampus: (id: number | null) => void;
  onYear: (id: number | null) => void;
  onMajor: (key: string | null) => void;
};

const toId = (value: string): number | null => (value === '' ? null : Number(value));

// Campuses are grouped by system because a student almost always knows
// whether they are aiming at a UC, a CSU or a private college before they
// know which one, and ASSIST's private coverage is patchy enough that the
// grouping is a warning in itself.
function campusGroups(campuses: Option[]): [string, Option[]][] {
  const order = ['UC', 'CSU', 'Private or independent', 'Other'];
  const groups = new Map<string, Option[]>();
  for (const c of campuses) {
    const key = c.system ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!]);
}

export function SchoolPicker(props: Props) {
  const { majorsState } = props;

  return (
    <div className="picker">
      <div className="field">
        <label htmlFor="college">Your community college</label>
        <select
          id="college"
          value={props.college ?? ''}
          onChange={(e) => props.onCollege(toId(e.target.value))}
        >
          <option value="">Choose your college</option>
          {props.colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="campus">Where you want to transfer</label>
        <select
          id="campus"
          value={props.campus ?? ''}
          onChange={(e) => props.onCampus(toId(e.target.value))}
        >
          <option value="">Choose a campus</option>
          {campusGroups(props.campuses).map(([system, list]) => (
            <optgroup key={system} label={system}>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="year">Catalog year</label>
        <select
          id="year"
          value={props.year ?? ''}
          disabled={props.years.length === 0}
          onChange={(e) => props.onYear(toId(e.target.value))}
        >
          {/* Only the years ASSIST actually has an agreement for, for this
              pair. A catalog year exists on ASSIST well before agreements
              are written under it, so offering every published year would
              send students to empty ones. */}
          {props.years.length === 0 && <option value="">Pick a college and a campus first</option>}
          {props.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="major">Major</label>
        <select
          id="major"
          value={props.major ?? ''}
          disabled={majorsState !== 'ready'}
          onChange={(e) => props.onMajor(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">
            {majorsState === 'loading'
              ? 'Loading majors…'
              : majorsState === 'ready'
                ? `Choose one of ${props.majors.length} majors`
                : 'Pick a college and a campus first'}
          </option>
          {props.majors.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        {majorsState === 'empty' && (
          <p className="field-note" role="status">
            ASSIST publishes no major agreements between these two for that year. That usually
            means the two schools have no agreement rather than that something went wrong. Try
            another catalog year, or another campus.
          </p>
        )}
      </div>
    </div>
  );
}
