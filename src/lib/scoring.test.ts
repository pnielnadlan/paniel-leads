// Smoke test למנוע הניקוד.
// הרצה: npx tsx src/lib/scoring.test.ts
// בודק 3 תרחישים: ניצחון נקי, תיקו שמוכרע ב-Q9-12, ותיקו עמוק שמוכרע ע"י פוקוס.

import { scoreSubmission, type Answers } from './scoring.ts';
import type { OptionId } from '../data/questions.ts';

type Case = {
  name: string;
  answers: Array<[number, OptionId]>;
  expect: { profile: string; focus: number; reportId: string };
};

const cases: Case[] = [
  {
    // ניצחון נקי לפרופיל P3 (מזהי הזדמנויות) עם פוקוס 3 (סוג עסקה)
    name: 'P3 wins cleanly with focus 3',
    answers: [
      [1, 'C'],   // P3
      [2, 'C'],   // P2
      [3, 'C'],   // capital_range only
      [4, 'B'],   // P5 + has_property=true
      [5, 'D'],   // P3
      [6, 'D'],   // P3
      [7, 'B'],   // P3 + headline + q8B
      [81, 'B'],  // P3
      [9, 'B'],   // P3
      [10, 'A'],  // P5
      [11, 'D'],  // P4
      [12, 'B'],  // P3
      [13, 'C'],  // focus 3
    ],
    expect: { profile: 'P3', focus: 3, reportId: '3.3' },
  },
  {
    // ניצחון של P1 (שומרי ביטחון) עם פוקוס 2 (בורות וסיכונים)
    name: 'P1 wins with focus 2',
    answers: [
      [1, 'A'],   // P1
      [2, 'B'],   // P1
      [3, 'A'],
      [4, 'A'],   // P1 + first_property
      [5, 'A'],   // P2
      [6, 'A'],   // P4
      [7, 'A'],   // P1 + q8A
      [80, 'A'],  // P1
      [9, 'A'],   // P1
      [10, 'B'],  // P4
      [11, 'C'],  // P1
      [12, 'A'],  // P2
      [13, 'B'],  // focus 2
    ],
    expect: { profile: 'P1', focus: 2, reportId: '2.1' },
  },
  {
    // תיקו אמיתי: P2=4, P3=4. גם בש' 9-12 תיקו (P2=1, P3=1).
    // מוכרע ע"י עדיפות פוקוס 5 → [P1, P2, P4, P3, P5] → P2 ינצח.
    name: 'True tie P2/P3, deep tie in Q9-12, broken by focus-5 priority',
    answers: [
      [1, 'B'],   // P2
      [2, 'A'],   // P2
      [3, 'C'],
      [4, 'A'],   // P1 + first_property
      [5, 'A'],   // P2
      [6, 'D'],   // P3
      [7, 'B'],   // P3 + q81 variant
      [81, 'B'],  // P3
      [9, 'D'],   // P2 (late)
      [10, 'A'],  // P5
      [11, 'D'],  // P4
      [12, 'B'],  // P3 (late)
      [13, 'E'],  // focus 5
    ],
    expect: { profile: 'P2', focus: 5, reportId: '5.2' },
  },
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  const answers: Answers = new Map(c.answers);
  try {
    const result = scoreSubmission(answers);
    const ok =
      result.winningProfile === c.expect.profile &&
      result.reportFocus === c.expect.focus &&
      result.reportId === c.expect.reportId;
    if (ok) {
      console.log(`PASS  ${c.name}`);
      console.log(`      → scores: ${JSON.stringify(result.scores)}, winner: ${result.winningProfile}, report: ${result.reportId}`);
      passed++;
    } else {
      console.log(`FAIL  ${c.name}`);
      console.log(`      expected profile=${c.expect.profile}, focus=${c.expect.focus}, reportId=${c.expect.reportId}`);
      console.log(`      got      profile=${result.winningProfile}, focus=${result.reportFocus}, reportId=${result.reportId}`);
      console.log(`      scores: ${JSON.stringify(result.scores)}`);
      failed++;
    }
  } catch (err) {
    console.log(`ERROR ${c.name}: ${(err as Error).message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
