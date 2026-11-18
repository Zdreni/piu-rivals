// The grade groups of the Passes page, counted in its level bars' tooltips: your best grade on a chart, in larger
//  groups, or "unplayed". "fpc" is a pass with the maximum score. A broken best counts under its grade.
export type GradeGroup = 'fpc' | 'sss' | 's' | 'a' | 'lower' | 'unplayed';

// The best first.
export const GRADE_GROUPS: GradeGroup[] = ['fpc', 'sss', 's', 'a', 'lower', 'unplayed'];

export const GRADE_GROUP_LABELS: Record<GradeGroup, string> = { fpc: 'FPC', sss: 'SSS–SSS+', s: 'S–SS+', a: 'A–AAA+', lower: 'Lower', unplayed: 'Not played' };

export const MAX_SCORE = 1_000_000;

// The lowest score of each played group below FPC, for a best stored without its grade.
const MIN_GROUP_SCORES: [GradeGroup, number][] = [['sss', 990_000], ['s', 970_000], ['a', 750_000]];


// The group of a best: FPC for a pass with the maximum score, otherwise from its grade image name (e.g. "sssplus",
//  "aa"), or from its score if it has none.
export function gradeGroup(grade: string | null, score: number, passed: boolean): GradeGroup {
  if (passed  &&  score === MAX_SCORE)
    return 'fpc';

  if (grade === null)
    return MIN_GROUP_SCORES.find(([, minScore])  =>  score >= minScore)?.[0]  ??  'lower';

  if (grade.startsWith('sss'))
    return 'sss';

  if (grade.startsWith('s'))
    return 's';

  return (grade.startsWith('a')  ?  'a'  :  'lower');
}


// A grade image name as shown, e.g. "sssplus" as "SSS+".
export const gradeLabel = (grade: string)  =>  grade.replace(/plus$/, '+').toUpperCase();
