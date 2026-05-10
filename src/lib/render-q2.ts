// V2 (q2) — render report for PDF.
// קלט: report id + שם פרטי. פלט: title/subtitle/bodyHtml מוכנים להזרקה ל-pdf-html-q2.

import { marked } from 'marked';
import { Q2_REPORTS } from '../data/reports-q2.ts';
import { Q2_REPORT_NAMES, type RId } from '../data/questions-q2.ts';

export type Q2RenderInput = {
  reportId: RId;
  fullName: string;
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

function substitute(text: string, vars: { fullName: string }): string {
  return text.replaceAll('[[שם פרטי]]', vars.fullName);
}

export function renderQ2Report(input: Q2RenderInput): Q2RenderOutput {
  const report = Q2_REPORTS[input.reportId];
  const fullName = input.fullName.trim();

  const body = substitute(report.pdfReport.body, { fullName });
  const bodyHtml = marked.parse(body, { async: false }) as string;

  const simulatorOutput = substitute(report.simulatorOutput, { fullName });

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
