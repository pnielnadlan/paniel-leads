// מנוע ניקוד — פניאל נדל"ן
// קלט: תשובות המשתמש (Map של qid → optionId).
// פלט: פרופיל מנצח, פוקוס דוח, מטא-נתונים ל-CRM, ו-report_id סופי.
//
// הלוגיקה לפי הספק:
//   1. מסכמים נקודות פרופיל מכל השאלות (פרט לש' 3 ולש' 13).
//   2. אם יש תיקו — שלוש שכבות הכרעה:
//      א. רק ש' 9-12, ורק עבור הפרופילים השווים.
//      ב. סדר עדיפות לפי ש' 13 (פוקוס).
//      ג. סדר ברירת מחדל גלובלי: P4 > P1 > P2 > P3 > P5.

import {
  QUESTIONS,
  type Question,
  type Option,
  type OptionId,
  type ProfileId,
  type ReportFocus,
  type CapitalRange,
  type InvestmentGoal,
} from '../data/questions.ts';

export type Answers = Map<number, OptionId>;

export type ScoringResult = {
  scores: Record<ProfileId, number>;
  winningProfile: ProfileId;
  reportFocus: ReportFocus;
  capitalRange: CapitalRange;
  investmentGoal: InvestmentGoal;
  hasExistingProperty: boolean;
  selectedHeadline: string;
  reportId: string;
};

const FOCUS_PRIORITY_ORDER: Record<ReportFocus, ProfileId[]> = {
  1: ['P2', 'P1', 'P5', 'P3', 'P4'],
  2: ['P4', 'P2', 'P1', 'P3', 'P5'],
  3: ['P3', 'P4', 'P2', 'P5', 'P1'],
  4: ['P2', 'P3', 'P4', 'P5', 'P1'],
  5: ['P1', 'P2', 'P4', 'P3', 'P5'],
};

const GLOBAL_DEFAULT_ORDER: ProfileId[] = ['P4', 'P1', 'P2', 'P3', 'P5'];

const PROFILE_NUMBERS: Record<ProfileId, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
};

function findQuestion(qid: number): Question {
  const q = QUESTIONS.find((q) => q.id === qid);
  if (!q) throw new Error(`Question ${qid} not found`);
  return q;
}

function getOption(question: Question, optionId: OptionId): Option {
  const opt = question.options.find((o) => o.id === optionId);
  if (!opt) {
    throw new Error(`Option ${optionId} not found in question ${question.id}`);
  }
  return opt;
}

export function scoreSubmission(answers: Answers): ScoringResult {
  const scores: Record<ProfileId, number> = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };

  let capitalRange: CapitalRange | undefined;
  let investmentGoal: InvestmentGoal | undefined;
  let hasExistingProperty: boolean | undefined;
  let selectedHeadline: string | undefined;
  let reportFocus: ReportFocus | undefined;

  for (const [qid, oid] of answers.entries()) {
    const q = findQuestion(qid);
    const opt = getOption(q, oid);

    if (opt.scores) {
      for (const [profile, pts] of Object.entries(opt.scores)) {
        scores[profile as ProfileId] += pts ?? 0;
      }
    }
    if (opt.capitalRange) capitalRange = opt.capitalRange;
    if (opt.investmentGoal) investmentGoal = opt.investmentGoal;
    if (opt.hasExistingProperty !== undefined) hasExistingProperty = opt.hasExistingProperty;
    if (opt.selectedHeadline) selectedHeadline = opt.selectedHeadline;
    if (opt.reportFocus) reportFocus = opt.reportFocus;
  }

  if (capitalRange === undefined) {
    throw new Error('חסרה תשובה לשאלה 3 (capital_range)');
  }
  if (investmentGoal === undefined || hasExistingProperty === undefined) {
    throw new Error('חסרה תשובה לשאלה 4 (investment_goal / has_existing_property)');
  }
  if (selectedHeadline === undefined) {
    throw new Error('חסרה תשובה לשאלה 7 (selected_headline)');
  }
  if (reportFocus === undefined) {
    throw new Error('חסרה תשובה לשאלה 13 (report_focus)');
  }

  const winningProfile = resolveWinner(scores, answers, reportFocus);

  return {
    scores,
    winningProfile,
    reportFocus,
    capitalRange,
    investmentGoal,
    hasExistingProperty,
    selectedHeadline,
    reportId: `${reportFocus}.${PROFILE_NUMBERS[winningProfile]}`,
  };
}

function resolveWinner(
  scores: Record<ProfileId, number>,
  answers: Answers,
  reportFocus: ReportFocus,
): ProfileId {
  const maxScore = Math.max(...Object.values(scores));
  const tied = (Object.entries(scores) as [ProfileId, number][])
    .filter(([, s]) => s === maxScore)
    .map(([p]) => p);

  if (tied.length === 1) return tied[0];

  // שלב הכרעה 1: רק ש' 9-12, וסופרים רק עבור הפרופילים בתיקו.
  const lateScores: Record<ProfileId, number> = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
  for (const qid of [9, 10, 11, 12]) {
    const oid = answers.get(qid);
    if (!oid) continue;
    const q = findQuestion(qid);
    const opt = getOption(q, oid);
    if (!opt.scores) continue;
    for (const [profile, pts] of Object.entries(opt.scores)) {
      const p = profile as ProfileId;
      if (tied.includes(p)) lateScores[p] += pts ?? 0;
    }
  }

  const maxLate = Math.max(...tied.map((p) => lateScores[p]));
  const stillTied = tied.filter((p) => lateScores[p] === maxLate);
  if (stillTied.length === 1) return stillTied[0];

  // שלב הכרעה 2: סדר עדיפות לפי הפוקוס שנבחר בש' 13.
  for (const p of FOCUS_PRIORITY_ORDER[reportFocus]) {
    if (stillTied.includes(p)) return p;
  }

  // שלב הכרעה 3: סדר ברירת מחדל גלובלי.
  for (const p of GLOBAL_DEFAULT_ORDER) {
    if (stillTied.includes(p)) return p;
  }

  return stillTied[0];
}
