// What a college's own catalog says has to come before what.
//
// ASSIST carries no prerequisites. It says which of a college's courses
// satisfy a university's requirement and nothing about the order they can be
// taken in, which is how a plan could tell a student to take CS 002 in the
// same term as CS 003A, the course it is the prerequisite for. The colleges
// publish the order themselves, in their catalogs, and this is that.

export type CoursePrereqs = {
  // The catalog's own code, normalised the way the catalog writes it.
  code: string;
  // Every course named as a prerequisite, flattened.
  //
  // Flattened deliberately. A catalog states these as prose with alternatives
  // in it, "MATH 005A or MATH 005AH", and the planner does not need to resolve
  // the alternative: it only asks whether a course that is ALREADY IN THIS
  // STUDENT'S PLAN has to come earlier. A student holds one side of an
  // either/or, never both, so requiring every listed code that appears in the
  // plan to come first is the same answer with none of the parsing.
  prerequisites: string[];
  // Courses the catalog says must be taken WITH this one. A lecture and its
  // lab are nearly all of these, and reading them here is better than
  // guessing them from a trailing L in the code.
  corequisites: string[];
  // Named and never acted on. "Recommended Preparation" is advice, not a
  // gate, and scheduling around it would push work later for no reason. Kept
  // so the interface can show a student what their college suggests.
  recommended: string[];
  // What the catalog says this course used to be called. California is
  // renumbering courses statewide, ECON 1B became ECON C2001, and the
  // agreements on ASSIST lag the catalogs by a year, so the old code is what
  // the plan asks for and the new course is where the answer is.
  formerly: string[];
  // The course's own units and title, where the catalog page carried them.
  // Read so that a prerequisite the agreement never mentions can be put into
  // the plan as a real course, with a real unit count, rather than a warning.
  units?: number;
  title?: string;
  // Whether the prerequisite line offers placement as another way in:
  // "MATH 008 or MATH 009, or placement based on the assessment process". A
  // student who placed into calculus does not owe MATH 008, so such a
  // prerequisite is reported rather than added to the plan.
  placementAlternative: boolean;
};

// Everything known about one college's courses, keyed by normalised code.
export type PrereqIndex = Map<string, CoursePrereqs>;
