// Community college units are semester units. UC and most receiving
// institutions in this project run on the quarter system, so unit totals
// shown to a student need converting before they mean anything to them.
export function semesterToQuarter(units: number): number {
  return Math.round(units * 1.5 * 100) / 100;
}
