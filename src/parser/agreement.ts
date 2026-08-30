import type { Requirement } from './groups';
import type { Section } from './sections';
import type { Course } from './types';

// The agreement shape both producers build: the PDF parser in document.ts
// and the ASSIST mapper in src/assist/agreement.ts.
//
// This lives apart from document.ts on purpose. document.ts imports pdfjs,
// which reaches for DOMMatrix at module evaluation and is simply not there
// in a serverless Node runtime. A server route that wanted nothing but the
// Agreement type or UnrecognisedAgreementError used to pull the whole PDF
// stack in behind it and crash the function before it ran a line. Types are
// erased, so only the error class ever needed moving, but keeping the shape
// here with it means nothing on the API path has a reason to reach into the
// parser at all.

export type ArticulationRow = {
  receiving: Course[];
  sending: Requirement;
  // Rows sharing an orGroup are alternative paths through one requirement,
  // coming from an OR connector in the receiving column. Satisfying any one
  // member satisfies the group. Without this the planner cannot tell "two
  // separate requirements" from "one requirement, two routes", and will tell
  // a student to somehow obtain a course that nothing articulates to when a
  // sibling route is wide open.
  orGroup?: number;
  // Indexes into Agreement.sections. Which section a row belongs to decides
  // whether it is required outright or one of several alternatives under a
  // choose-at-least quantifier; see assignSections below.
  section?: number;
  // What the receiving side actually is. Almost every cell names a course,
  // but ASSIST also publishes cells that name a requirement with no course
  // code ("a world history area") and cells that name a general education
  // pattern. Neither carries units and neither can be scheduled like a
  // course, so they are marked here and rendered as what they are rather
  // than dressed up as a zero-unit course.
  receivingKind?: 'course' | 'requirement' | 'ge_pattern';
  // Which route within a 'choose_route' section this row belongs to. Rows
  // sharing a route must all be completed together, and completing any one
  // route satisfies the section. Only the ASSIST API sets this; the PDF
  // parser cannot see routes and leaves it undefined.
  route?: number;
};
export type Agreement = {
  academicYear: string;
  major: string;
  receivingInstitution: string;
  sendingInstitution: string;
  rows: ArticulationRow[];
  sections: Section[];
  // Page 1 advisory prose in the receiving campus's own words: admission
  // competitiveness, minimum grade requirements, sequence-splitting
  // warnings, and the like. None of this has a structure this parser can
  // read (no course codes, no quantifiers), so it is captured verbatim by
  // line rather than interpreted, and nothing downstream (the planner
  // included) ever reads it back in. It exists only to be displayed.
  // Optional on the type only so the hand-built Agreement literals in
  // tests/planner/plan.test.ts, written before this field existed, keep
  // typechecking unchanged; parseAgreement itself always sets it.
  notes?: string[];
};

// Thrown instead of returning an agreement with no rows and no recognisable
// header. Without this, a PDF that is not an agreement (the wrong file, or a
// scan with no text layer) parses cleanly to an empty Agreement, and the page
// reports 0 units remaining and nothing left to schedule: it tells a student
// who has done nothing that they are finished transferring.
export class UnrecognisedAgreementError extends Error {
  constructor() {
    super('That file does not look like an ASSIST articulation agreement.');
    this.name = 'UnrecognisedAgreementError';
  }
}
