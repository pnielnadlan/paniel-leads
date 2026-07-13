// V2 (q2) — render report for PDF.
// קלט: report id + שם פרטי. פלט: title/subtitle/bodyHtml מוכנים להזרקה ל-pdf-html-q2.

import { marked } from 'marked';
import { Q2_REPORTS } from '../data/reports-q2.ts';
import { Q2_REPORT_NAMES, type RId } from '../data/questions-q2.ts';

export type Q2RenderInput = {
  reportId: RId;
  /** שם מלא — משמש בכותרת ה-PDF ("דוח אישי עבור..."). */
  fullName: string;
  /** שם פרטי בלבד — משמש להחלפת [[שם פרטי]] בתוך גוף הדוח.
   *  אם לא סופק, נחלץ מ-fullName כ-fallback. */
  firstName?: string;
};

export type Q2RenderOutput = {
  reportId: RId;
  reportName: string;
  title: string;
  subtitle: string;
  fullName: string;
  bodyHtml: string;
  /** טקסט "פלט" קצר לתצוגה ב-UI (לא ל-PDF). */
  simulatorOutput: string;
};

function substitute(text: string, vars: { firstName: string }): string {
  return text.replaceAll('[[שם פרטי]]', vars.firstName);
}

export function renderQ2Report(input: Q2RenderInput): Q2RenderOutput {
  const report = Q2_REPORTS[input.reportId];
  const fullName = input.fullName.trim();
  // אם לא סופק שם פרטי — מחלצים אותו מהשם המלא (לפני הרווח הראשון).
  const firstName =
    input.firstName?.trim() || fullName.split(' ')[0] || fullName;

  const body = substitute(report.pdfReport.body, { firstName });
  const bodyHtml = marked.parse(body, { async: false }) as string;

  const simulatorOutput = substitute(report.simulatorOutput, { firstName });

  return {
    reportId: input.reportId,
    reportName: Q2_REPORT_NAMES[input.reportId],
    title: report.pdfReport.title,
    subtitle: report.pdfReport.subtitle,
    fullName,
    bodyHtml,
    simulatorOutput,
  };
}
