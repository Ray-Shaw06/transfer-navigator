#!/usr/bin/env node
// Checks that the deployed site can still read ASSIST end to end.
//
// This exists because ASSIST is not ours. If they change a route, rename an
// enum value, or alter the antiforgery handshake, this site breaks silently
// for every visitor and nobody finds out. A scheduled run turns that into a
// failed workflow and an email.
//
// Everything is derived rather than hardcoded: agreement keys carry a UUID
// that changes whenever an agreement is republished, so a pinned key would
// fail every summer for a reason that is not a bug. The checks below are
// structural, asserting that the shape of the data still holds, not that any
// particular course is still in it.

const BASE = process.argv[2] ?? process.env.CANARY_BASE ?? 'https://transfer-navigator.vercel.app';

const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (condition) notes.push(`  ok   ${name}${detail ? ` (${detail})` : ''}`);
  else failures.push(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  return condition;
}

async function getJson(path) {
  const response = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${path} returned ${response.status} ${body.slice(0, 160)}`);
  }
  return response.json();
}

async function main() {
  console.log(`Canary against ${BASE}\n`);

  // 1. The catalog. Counts are floors well under the real numbers, so a
  //    genuine change in California's colleges does not trip this, but ASSIST
  //    returning an empty or truncated list does.
  const catalog = await getJson('/api/assist/institutions');
  check('institutions: community colleges', catalog.colleges?.length >= 100, `${catalog.colleges?.length}`);
  check('institutions: receiving campuses', catalog.campuses?.length >= 50, `${catalog.campuses?.length}`);
  check('institutions: academic years', catalog.academicYears?.length >= 10, `${catalog.academicYears?.length}`);
  check(
    'institutions: campuses carry a system',
    (catalog.campuses ?? []).every((c) => typeof c.system === 'string' && c.system.length > 0),
  );

  // Pick a college with a lot of partners rather than naming one, so the
  // canary does not depend on any single college still existing.
  const college = catalog.colleges?.[0];
  if (!college) throw new Error('no colleges returned; nothing further can be checked');

  // 2. Partners and the years each pair actually has.
  const { partners } = await getJson(`/api/assist/partners?college=${college.id}`);
  check(`partners for ${college.name}`, partners?.length >= 10, `${partners?.length}`);
  const partner = (partners ?? []).find((p) => p.years?.length > 0);
  check('partners carry available years', Boolean(partner));
  if (!partner) throw new Error('no partner with years; cannot reach an agreement');

  // 3. Majors for that pair, in its newest available year.
  const year = partner.years[0];
  const { majors } = await getJson(
    `/api/assist/majors?sending=${college.id}&receiving=${partner.id}&year=${year}`,
  );
  check('majors for the pair', majors?.length >= 1, `${majors?.length}`);
  const major = majors?.[0];
  if (!major) throw new Error('no majors; cannot reach an agreement');
  check('major keys look like ASSIST keys', /^\d+\/\d+\/to\/\d+\/Major\/[0-9a-fA-F-]{36}$/.test(major.key), major.key);

  // 4. The agreement itself, which is the whole reason this site exists.
  const { agreement } = await getJson(`/api/assist/agreement?key=${encodeURIComponent(major.key)}`);
  check('agreement: has a major name', Boolean(agreement?.major), agreement?.major);
  check('agreement: names both institutions', Boolean(agreement?.sendingInstitution && agreement?.receivingInstitution));
  check('agreement: has requirements', agreement?.rows?.length >= 1, `${agreement?.rows?.length} rows`);
  check(
    'agreement: every row has a receiving side',
    (agreement?.rows ?? []).every((r) => r.receiving?.length >= 1),
  );
  check(
    'agreement: every row points at a real section',
    (agreement?.rows ?? []).every((r) => r.section === undefined || agreement.sections?.[r.section]),
  );
  check(
    'agreement: section rules are ones the planner knows',
    (agreement?.sections ?? []).every((s) =>
      ['all', 'choose', 'choose_units', 'choose_route', 'advisory'].includes(s.rule?.kind),
    ),
    (agreement?.sections ?? []).map((s) => s.rule?.kind).join(','),
  );

  // 5. The general education patterns. listType takes the enum NAME; passing
  //    the number silently returns the CSU transferable list instead, which is
  //    wrong data that looks right, so each pattern's area codes are checked
  //    against a shape only that pattern has.
  const geYear = catalog.academicYears.find((y) => y.label.startsWith('2025'))?.id ?? year;

  const patterns = [
    { key: 'CALGETC', signature: (codes) => codes.includes('1A') && codes.includes('6') && !codes.includes('2A') },
    { key: 'IGETC', signature: (codes) => codes.includes('2A') && codes.includes('6A') },
    { key: 'CSUGE', signature: (codes) => codes.includes('A1') && codes.includes('F') },
  ];

  for (const pattern of patterns) {
    const { ge } = await getJson(
      `/api/assist/ge?college=${college.id}&year=${geYear}&pattern=${pattern.key}`,
    );
    const areaCodes = (ge?.areas ?? []).map((a) => a.code);
    check(`${pattern.key}: returned`, ge?.pattern === pattern.key, ge?.pattern);
    check(`${pattern.key}: has areas`, areaCodes.length >= 5, `${areaCodes.length} areas`);
    check(
      `${pattern.key}: areas are this pattern's, not another list`,
      pattern.signature(areaCodes),
      areaCodes.slice(0, 8).join(','),
    );
    check(`${pattern.key}: courses carry areas`, (ge?.byCourse ?? []).every((c) => c.areas?.length >= 1));
  }

  // An unknown pattern must be refused rather than silently served something.
  const rejected = await fetch(`${BASE}/api/assist/ge?college=${college.id}&year=${geYear}&pattern=NOPE`);
  check('unknown pattern is refused', rejected.status === 400, `${rejected.status}`);

  console.log(notes.join('\n'));
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(`\nAll ${notes.length} checks passed.`);
}

main().catch((error) => {
  console.error(notes.join('\n'));
  console.error(`\nCanary could not complete: ${error.message}`);
  process.exit(1);
});
