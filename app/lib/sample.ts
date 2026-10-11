// What the home page shows before the live demo has loaded, and if it cannot.
// Taken from a real run of the planner on the example agreement, so it is
// output the tool actually produces. A snapshot: if the planner's output for
// this agreement changes, refresh it from /plan.
export type SampleTerm = {
  season: string;
  year: number;
  units: number;
  items: { text: string; code: boolean }[];
};

const c = (text: string) => ({ text, code: true });
const a = (text: string) => ({ text, code: false });

export const SAMPLE = {
  verdict: '5 requirements left, finishing Spring 2029.',
  detail: '28 semester units to take. 25 on the agreement, 3 of prerequisites it does not mention.',
  terms: [
    {
      season: 'Spring',
      year: 2027,
      units: 15,
      items: [a('English Composition'), a('Critical Thinking and Composition'), c('CS 002'), c('MATH 005A')],
    },
    {
      season: 'Fall',
      year: 2027,
      units: 14,
      items: [a('Oral Communication'), a('Arts and Humanities'), c('CS 003A'), c('MATH 005B')],
    },
    {
      season: 'Spring',
      year: 2028,
      units: 14,
      items: [
        a('Arts and Humanities'),
        a('Social and Behavioral Sciences'),
        c('CS 003B'),
        c('CS 003BL'),
        c('MATH 010'),
      ],
    },
    {
      season: 'Fall',
      year: 2028,
      units: 13,
      items: [
        a('Social and Behavioral Sciences'),
        a('Physical and Biological Sciences'),
        c('CS 008'),
        a('Physical and Biological Sciences'),
      ],
    },
    { season: 'Spring', year: 2029, units: 3, items: [a('Ethnic Studies')] },
  ] as SampleTerm[],
};
