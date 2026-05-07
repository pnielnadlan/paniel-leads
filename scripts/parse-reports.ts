// סקריפט חד-פעמי שממיר את שני קובצי המקור (reports.txt + questionnaire.txt)
// ל-25 קבצי .md בתיקיית src/templates/.
//
// כל קובץ מכיל:
//   - YAML frontmatter עם title, teasers, meeting_sentence,
//     property_paragraphs (no/yes)
//   - גוף הדוח עם ## כותרות סקציה
//   - placeholder {{property_paragraph}} שמוחלף בזמן הרינדור לפי has_existing_property
//   - placeholders [[שם פרטי]] ו-[[הון עצמי]] שמוחלפים בזמן הרינדור
//
// הרצה: npx tsx scripts/parse-reports.ts
//   (או: node --experimental-strip-types scripts/parse-reports.ts)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const REPORTS_FILE = join(REPO, 'scripts/source/reports.txt');
const QUESTIONNAIRE_FILE = join(REPO, 'scripts/source/questionnaire.txt');
const TEMPLATE_DIR = join(REPO, 'src/templates');

// כל הכותרות הידועות בדוחות. לפי הספק, סקציות הדוח משתנות לפי הפוקוס,
// ולכן יש כאן את הסט המלא.
const KNOWN_HEADINGS = new Set<string>([
  // משותפות
  'איך זה מתחבר להון העצמי שלכם',
  'משפט סיכום',
  // focus 1
  'מה הפרופיל שלכם אומר',
  'נקודת החוזק שלכם',
  'נקודת הזהירות',
  'מה נכון לבדוק בפגישה',
  // focus 2
  'מה הבור הזה אומר בפועל',
  'איפה הטעות עלולה לקרות',
  'מה חשוב לעשות אחרת',
  // focus 3
  'למה זה מתאים לכם',
  'איזה עסקאות פחות מתאימות',
  'מה כן כדאי לבדוק',
  // focus 4
  'מה זה אומר עליכם',
  'מה כדאי ללמוד',
  'מה יקרה כשזה ישתפר',
  // focus 5
  'מה אפשר לעשות לבד',
  'איפה הליווי נותן ערך',
]);

type ReportRaw = {
  reportId: string;
  title: string;
  bodyLines: string[];
};

type TeaserData = {
  teasers: string[];
  meetingSentence: string;
};

function parseReports(text: string): Map<string, ReportRaw> {
  const result = new Map<string, ReportRaw>();
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^דוח (\d+\.\d+)\s*$/);
    if (!m) {
      i++;
      continue;
    }

    const reportId = m[1];
    i++;

    // דלג על שורות מטא: report_id =, report_focus =, investor_profile =
    while (i < lines.length && /^(report_id|report_focus|investor_profile)\s*=/.test(lines[i])) {
      i++;
    }

    // דלג על שורות ריקות לפני הכותרת
    while (i < lines.length && lines[i].trim() === '') i++;
    const title = (lines[i] ?? '').trim();
    i++;

    // אסוף את גוף הדוח עד "דוח X.Y" הבא
    const bodyLines: string[] = [];
    while (i < lines.length && !/^דוח \d+\.\d+\s*$/.test(lines[i])) {
      bodyLines.push(lines[i]);
      i++;
    }

    result.set(reportId, { reportId, title, bodyLines });
  }

  return result;
}

function parseTeasers(text: string): Map<string, TeaserData> {
  const result = new Map<string, TeaserData>();
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^דוח (\d+\.\d+)\s*-/);
    if (!m) {
      i++;
      continue;
    }

    const reportId = m[1];
    i++;

    // מצא "5 תובנות למסך סיום"
    while (i < lines.length && lines[i].trim() !== '5 תובנות למסך סיום') i++;
    if (i >= lines.length) break;
    i++;

    // קרא את 5 הבולטים — שורות שמתחילות בתו bullet (•) עם ידוא
    const teasers: string[] = [];
    while (i < lines.length && teasers.length < 5) {
      const raw = lines[i];
      // bullet יכול להיות מקודם ב-tab. דוגמה: "\t•\tטקסט"
      const cleaned = raw.replace(/^\s*[••]?\s*/u, '').trim();
      if (cleaned && !/^משפט פגישה$/.test(cleaned)) {
        teasers.push(cleaned);
      }
      i++;
    }

    // מצא "משפט פגישה"
    while (i < lines.length && lines[i].trim() !== 'משפט פגישה') i++;
    if (i >= lines.length) break;
    i++;

    // השורה הבאה הלא ריקה היא משפט הפגישה
    while (i < lines.length && lines[i].trim() === '') i++;
    const meetingSentence = (lines[i] ?? '').trim();
    i++;

    result.set(reportId, { teasers, meetingSentence });
  }

  return result;
}

type RenderedBody = {
  markdown: string;
  noPropertyParagraph: string;
  hasPropertyParagraph: string;
};

function renderBody(bodyLines: string[]): RenderedBody {
  let noProp = '';
  let hasProp = '';
  const out: string[] = [];
  let propertyPlaceholderEmitted = false;

  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line) {
      out.push('');
      continue;
    }

    if (line.startsWith('אם has_existing_property = false:')) {
      noProp = line.replace(/^אם has_existing_property = false:\s*/, '').trim();
      continue;
    }
    if (line.startsWith('אם has_existing_property = true:')) {
      hasProp = line.replace(/^אם has_existing_property = true:\s*/, '').trim();
      // אחרי שני המשתנים — שתל placeholder אחד
      if (!propertyPlaceholderEmitted) {
        out.push('');
        out.push('{{property_paragraph}}');
        propertyPlaceholderEmitted = true;
      }
      continue;
    }

    if (KNOWN_HEADINGS.has(line)) {
      out.push('');
      out.push(`## ${line}`);
      continue;
    }

    out.push(line);
  }

  const cleaned = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { markdown: cleaned, noPropertyParagraph: noProp, hasPropertyParagraph: hasProp };
}

function yamlString(s: string): string {
  // עוטף מחרוזת ב-YAML כ-double-quoted, מחליף " פנימיים, ושומר על תווים יוניקודיים.
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

const reportsText = readFileSync(REPORTS_FILE, 'utf-8');
const questionnaireText = readFileSync(QUESTIONNAIRE_FILE, 'utf-8');

const reports = parseReports(reportsText);
const teasers = parseTeasers(questionnaireText);

mkdirSync(TEMPLATE_DIR, { recursive: true });

const issues: string[] = [];
let count = 0;

for (const [reportId, raw] of reports.entries()) {
  const { markdown, noPropertyParagraph, hasPropertyParagraph } = renderBody(raw.bodyLines);
  const teaserData = teasers.get(reportId);

  if (!teaserData) {
    issues.push(`[${reportId}] missing teaser data`);
  } else if (teaserData.teasers.length !== 5) {
    issues.push(`[${reportId}] expected 5 teasers, got ${teaserData.teasers.length}`);
  }
  if (!noPropertyParagraph) issues.push(`[${reportId}] missing no-property paragraph`);
  if (!hasPropertyParagraph) issues.push(`[${reportId}] missing has-property paragraph`);

  const [focusStr, profileNum] = reportId.split('.');
  const profile = `P${profileNum}`;

  const yamlLines: string[] = [
    '---',
    `report_id: ${yamlString(reportId)}`,
    `focus: ${focusStr}`,
    `profile: ${profile}`,
    `title: ${yamlString(raw.title)}`,
    'teasers:',
    ...((teaserData?.teasers ?? []).map((t) => `  - ${yamlString(t)}`)),
    `meeting_sentence: ${yamlString(teaserData?.meetingSentence ?? '')}`,
    `if_no_property: ${yamlString(noPropertyParagraph)}`,
    `if_has_property: ${yamlString(hasPropertyParagraph)}`,
    '---',
  ];

  const fileContent = `${yamlLines.join('\n')}\n\n# ${raw.title}\n\n${markdown}\n`;
  const outPath = join(TEMPLATE_DIR, `${reportId}.md`);
  writeFileSync(outPath, fileContent, 'utf-8');
  count++;
}

// בנוסף לטמפלייטים — מייצר קובץ TS עם 25 סטים של teasers + meeting_sentence,
// כדי שהוויידג'ט יוכל להציג tease מתאים ללא round-trip ל-server.
const teasersDataPath = join(REPO, 'src/data/teasers.ts');
const teasersDataLines: string[] = [
  '// קובץ מייצור אוטומטי על-ידי scripts/parse-reports.ts',
  '// אל תערוך ידנית — שינוי תוכן? עדכן את scripts/source/ והרץ מחדש.',
  '',
  'export type ReportTeaserData = {',
  '  teasers: string[];',
  '  meetingSentence: string;',
  '};',
  '',
  'export const TEASERS_BY_REPORT: Record<string, ReportTeaserData> = {',
];
for (const [reportId, raw] of reports.entries()) {
  const t = teasers.get(reportId);
  if (!t) continue;
  teasersDataLines.push(`  "${reportId}": {`);
  teasersDataLines.push('    teasers: [');
  for (const teaser of t.teasers) {
    teasersDataLines.push(`      ${JSON.stringify(teaser)},`);
  }
  teasersDataLines.push('    ],');
  teasersDataLines.push(`    meetingSentence: ${JSON.stringify(t.meetingSentence)},`);
  teasersDataLines.push('  },');
}
teasersDataLines.push('};');
writeFileSync(teasersDataPath, teasersDataLines.join('\n') + '\n', 'utf-8');

console.log(`Reports parsed: ${reports.size}`);
console.log(`Teaser sets parsed: ${teasers.size}`);
console.log(`Templates generated: ${count} → ${TEMPLATE_DIR}`);
console.log(`Teasers data: ${teasersDataPath}`);
if (issues.length) {
  console.log('\nIssues:');
  for (const issue of issues) console.log(`  - ${issue}`);
} else {
  console.log('\nAll templates generated cleanly. ✓');
}
