// The subset of ASSIST's JSON this project reads. These are structural
// types over a response nobody controls, so every field that is not needed
// to plan is left off rather than mirrored, and the fields that are here are
// optional wherever the sample showed them absent. The mapper in
// agreement.ts is written to fail loudly on a shape it does not recognise
// rather than to guess, so a field going missing surfaces as an
// UnrecognisedAgreementError and not as a silently shorter plan.
//
// Shapes and counts measured across 109 requirement groups sampled from UC,
// CSU and private agreements. See docs/plans/2026-08-29-assist-api-v2.md.

export type AssistCourse = {
  prefix?: string;
  courseNumber?: string;
  courseTitle?: string;
  minUnits?: number;
  maxUnits?: number;
};

export type AssistSeries = {
  conjunction?: 'And' | 'Or';
  name?: string;
  courses?: AssistCourse[];
};

// A cell is one requirement in the receiving column. `id` is what links it to
// an entry in `articulations`; a cell whose id appears in no entry has
// nothing articulated for it.
export type AssistCell = {
  type: 'Course' | 'Series' | 'Requirement' | 'CALGETC' | string;
  id?: string;
  course?: AssistCourse;
  series?: AssistSeries;
  requirement?: { name?: string };
};

export type AssistRow = { position?: number; cells?: AssistCell[] };

// A group's `sections` array mixes two things: a SectionHeader carrying a
// label, and the Sections that actually hold rows.
export type AssistSection = {
  type: 'Section' | 'SectionHeader' | string;
  position?: number;
  content?: string;
  rows?: AssistRow[];
};

// The rule over a group's sections. `Following` and a null instruction both
// mean everything is required. See toSectionRule in agreement.ts.
export type AssistInstruction = {
  type: 'Following' | 'Conjunction' | 'NFromArea' | 'NFromConjunction' | string;
  conjunction?: 'And' | 'Or';
  amount?: number;
  amountQuantifier?: string;
  amountUnitType?: 'Course' | 'Unit' | string;
};

export type AssistAsset = {
  type: 'GeneralTitle' | 'GeneralText' | 'RequirementTitle' | 'RequirementGroup' | string;
  area?: 'General' | 'Requirements' | string;
  position?: number;
  content?: string;
  instruction?: AssistInstruction | null;
  sections?: AssistSection[];
};

export type AssistSendingItem = {
  courseConjunction?: 'And' | 'Or';
  items?: AssistCourse[];
};

export type AssistArticulation = {
  templateCellId?: string;
  articulation?: {
    sendingArticulation?: {
      noArticulationReason?: string | null;
      items?: AssistSendingItem[];
    } | null;
  };
};

// `templateAssets` and `articulations` arrive as JSON strings inside the
// JSON, so they are parsed a second time. That is ASSIST's shape, not a
// mistake here.
export type AssistResult = {
  name?: string;
  templateAssets?: string;
  articulations?: string;
  receivingInstitution?: string;
  sendingInstitution?: string;
  academicYear?: string;
};

export type AssistInstitution = {
  id: number;
  code?: string;
  isCommunityCollege: boolean;
  category: number;
  names?: { name: string; fromYear?: number; hideInList?: boolean }[];
};

export type AssistAcademicYear = { id: number; fallYear: number };

export type AssistReport = { label: string; key: string };

// One row of /api/institutions/{id}/agreements: a school this institution
// has agreements with, and the academic year ids those agreements exist for.
// `receivingYearIds` is the list that matters when this institution is the
// sending school, which is always the case here.
export type AssistPartner = {
  institutionParentId: number;
  receivingYearIds?: number[];
  sendingYearIds?: number[];
};

// ---------------------------------------------------------------- Cal-GETC

// One area a course is certified for, from the transferability list.
// `code` is the Cal-GETC area ("1A", "2", "5C") and `codeDescription` is its
// name ("English Composition", "Laboratory").
export type AssistTransferArea = {
  code?: string;
  codeDescription?: string;
  areaType?: number;
};

export type AssistTransferabilityCourse = {
  prefixCode?: string;
  courseNumber?: string;
  courseTitle?: string;
  minUnits?: number;
  maxUnits?: number;
  courseIdentifierParentId?: number;
  departmentName?: string;
  transferAreas?: AssistTransferArea[];
};

// GET /api/transferability/courses?institutionId=&academicYearId=&listType=
// `listType` takes the enum NAME, not its number: listType=8 is silently
// ignored and falls back to the CSU transferable list, while
// listType=CALGETC returns what was asked for. Getting that wrong returns a
// plausible-looking list of the wrong thing, which is worse than an error.
export type AssistTransferabilityList = {
  listType?: number;
  institutionName?: string;
  academicYear?: { code?: string };
  courseInformationList?: AssistTransferabilityCourse[];
  headerCopy?: string;
};
