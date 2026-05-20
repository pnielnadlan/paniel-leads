// V2 (q2) — מנוע ניקוד.
// קלט: תשובות המשתמש (Map qid → optionId) + ה-audience variant.
// פלט: דוח מנצח (R1-R6) + מטא-נתונים ל-CRM.
//
// לוגיקה:
//   1. סוכמים נקודות לכל R לפי הניקוד שמוגדר על ה-options.
//   2. אם יש תיקו — סדר עדיפות: R3 > R6 > R2 > R4 > R5 > R1.
//   3. שלוש דריסות מאלצות (אחרי הניקוד והתיקו):
//      a. Q1=D ו-Q10=C → כפיית R5.
//      b. Q5=A ו-(Q10=A או Q11=A או Q11=B) → העדפת R6, אלא אם R5 קיבל ניקוד גבוה יותר.
//      c. Q7=D → אם R4 בטווח של עד 2 נקודות מהמוביל, בחירת R4.

import {
  Q2_QUESTIONS,
  type RId,
  type OptionId,
  type Q2Question,
  type Q2Option,
  type CapitalRange,
  type CashflowRange,
  type FamilyHelp,
  type Motivation,
} from '../data/questions-q2.ts';

export type Q2Answers = Map<string, OptionId>;

export type Q2ScoringResult = {
  scores: Record<RId, number>;
  selectedReport: RId;
  // מטא-נתונים ל-CRM
  capitalRange?: CapitalRange;
  cashflowRange?: CashflowRange;
  familyHelp?: FamilyHelp;
  motivation?: Motivation;
  hasExistingProperty?: boolean;
};

const TIEBREAK_ORDER: RId[] = ['R3', 'R6', 'R2', 'R4', 'R5', 'R1'];

/** מאחד את כל השאלות המוערכות למילון לפי id. */
const ALL_Q2_QUESTIONS: Map<string, Q2Question> = new Map(
  Q2_QUESTIONS.map((q) => [q.id, q] as [string, Q2Question]),
);

function getOption(qid: string, oid: OptionId): Q2Option | undefined {
  const q = ALL_Q2_QUESTIONS.get(qid);
  if (!q) return undefined;
  return q.options.find((o) => o.id === oid);
}

export function scoreQ2Submission(answers: Q2Answers): Q2ScoringResult {
  const scores: Record<RId, number> = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0 };

  let capitalRange: CapitalRange | undefined;
  let cashflowRange: CashflowRange | undefined;
  let familyHelp: FamilyHelp | undefined;
  let motivation: Motivation | undefined;
  let hasExistingProperty: boolean | undefined;

  for (const [qid, oid] of answers.entries()) {
    const opt = getOption(qid, oid);
    if (!opt) continue;
    if (opt.scores) {
      for (const [r, pts] of Object.entries(opt.scores)) {
        scores[r as RId] += pts ?? 0;
      }
    }
    if (opt.capitalRange) capitalRange = opt.capitalRange;
    if (opt.cashflowRange) cashflowRange = opt.cashflowRange;
    if (opt.familyHelp) familyHelp = opt.familyHelp;
    if (opt.motivation) motivation = opt.motivation;
    if (opt.hasExistingProperty !== undefined) hasExistingProperty = opt.hasExistingProperty;
  }

  // ─── דריסות מאלצות ────────────────────────────────────────────────────────
  // הסדר חשוב: בודקים מ"חזק" ל"רך" — דריסה 1 (R5) חזקה מכולן, דריסה 2 (R6)
  // מודה ל-R5 אם הוא בלאו הכי גבוה יותר, דריסה 3 (R4) חלשה ובאה לסיום.

  // דריסה 1: Q1=D AND Q10=C → R5 בכפייה
  if (answers.get('Q1') === 'D' && answers.get('Q10') === 'C') {
    return finalize('R5', scores, {
      capitalRange,
      cashflowRange,
      familyHelp,
      motivation,
      hasExistingProperty,
    });
  }

  // הכרעת מנצח טבעי לפי ניקוד + תיקו
  let winner = pickWinnerByScore(scores);

  // דריסה 2: אין תזרים חיובי (Q5=A) + פחד משמעותי → R6, אלא אם R5 גבוה יותר.
  // Q11 הוסר; הפחד מזוהה רק לפי Q10=A ("פחד לעשות טעות יקרה").
  if (answers.get('Q5') === 'A') {
    const hasFear = answers.get('Q10') === 'A';
    if (hasFear && scores.R5 < scores.R6 + 1) {
      winner = 'R6';
    }
  }

  // דריסה 3: Q7=D (משקיע מנוסה) → R4 אם הוא קרוב למוביל
  if (answers.get('Q7') === 'D') {
    const leaderScore = scores[winner];
    if (leaderScore - scores.R4 <= 2) {
      winner = 'R4';
    }
  }

  return finalize(winner, scores, {
    capitalRange,
    cashflowRange,
    familyHelp,
    motivation,
    hasExistingProperty,
  });
}

function pickWinnerByScore(scores: Record<RId, number>): RId {
  let bestScore = -1;
  let candidates: RId[] = [];
  for (const r of TIEBREAK_ORDER) {
    const s = scores[r];
    if (s > bestScore) {
      bestScore = s;
      candidates = [r];
    } else if (s === bestScore) {
      candidates.push(r);
    }
  }
  // ה-TIEBREAK_ORDER עצמו הוא סדר ההעדפה — נחזיר את ה-candidate הראשון לפיו
  for (const r of TIEBREAK_ORDER) {
    if (candidates.includes(r)) return r;
  }
  return candidates[0];
}

function finalize(
  selectedReport: RId,
  scores: Record<RId, number>,
  meta: {
    capitalRange?: CapitalRange;
    cashflowRange?: CashflowRange;
    familyHelp?: FamilyHelp;
    motivation?: Motivation;
    hasExistingProperty?: boolean;
  },
): Q2ScoringResult {
  return {
    scores,
    selectedReport,
    ...meta,
  };
}
