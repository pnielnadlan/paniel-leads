// Template renderer לדוחות PDF.
// קורא קובץ Markdown מ-src/templates, מחליף placeholders, ומחזיר אובייקט מבני.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import {
  CAPITAL_RANGE_LABELS,
  PROFILE_NAMES,
  FOCUS_NAMES,
  type CapitalRange,
  type ProfileId,
  type ReportFocus,
} from '../data/questions.ts';

// __dirname במצב ESM
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, '..', 'templates');

export type TemplateFrontmatter = {
  report_id: string;
  focus: ReportFocus;
  profile: ProfileId;
  title: string;
  teasers: string[];
  meeting_sentence: string;
  if_no_property: string;
  if_has_property: string;
};

export type RenderInput = {
  reportId: string;
  fullName: string;
  capitalRange: CapitalRange;
  hasExistingProperty: boolean;
};

export type RenderOutput = {
  reportId: string;
  focus: ReportFocus;
  profile: ProfileId;
  profileName: string;
  focusName: string;
  title: string;
  fullName: string;
  teasers: string[];
  meetingSentence: string;
  bodyHtml: string;
  bodyMarkdown: string;
};

function loadTemplate(reportId: string): { frontmatter: TemplateFrontmatter; body: string } {
  const path = join(TEMPLATE_DIR, `${reportId}.md`);
  const raw = readFileSync(path, 'utf-8');
  const parsed = matter(raw);
  return { frontmatter: parsed.data as TemplateFrontmatter, body: parsed.content };
}

function substitute(
  text: string,
  vars: { fullName: string; capitalLabel: string; propertyParagraph: string },
): string {
  return text
    .replaceAll('[[שם פרטי]]', vars.fullName)
    .replaceAll('[[הון עצמי]]', vars.capitalLabel)
    .replaceAll('{{property_paragraph}}', vars.propertyParagraph);
}

export function renderTemplate(input: RenderInput): RenderOutput {
  const { frontmatter, body } = loadTemplate(input.reportId);

  const propertyParagraph = input.hasExistingProperty
    ? frontmatter.if_has_property
    : frontmatter.if_no_property;

  const capitalLabel = CAPITAL_RANGE_LABELS[input.capitalRange];

  const substituted = substitute(body, {
    fullName: input.fullName,
    capitalLabel,
    propertyParagraph,
  });

  // הסר את שורת ה-# title הראשונה — נציג אותה בעיצוב נפרד ב-template ה-HTML.
  // gray-matter יכול להחזיר תוכן שמתחיל ב-\n, לכן trimStart לפני ה-regex.
  const bodyWithoutTitle = substituted.trimStart().replace(/^#\s+.+\n+/, '');

  const bodyHtml = marked.parse(bodyWithoutTitle, { async: false }) as string;

  // החלפה גם בתוך השדות שמופיעים ב-frontmatter (teasers + meeting_sentence)
  const teasers = frontmatter.teasers.map((t) =>
    substitute(t, { fullName: input.fullName, capitalLabel, propertyParagraph }),
  );
  const meetingSentence = substitute(frontmatter.meeting_sentence, {
    fullName: input.fullName,
    capitalLabel,
    propertyParagraph,
  });

  return {
    reportId: input.reportId,
    focus: frontmatter.focus,
    profile: frontmatter.profile,
    profileName: PROFILE_NAMES[frontmatter.profile],
    focusName: FOCUS_NAMES[frontmatter.focus],
    title: frontmatter.title,
    fullName: input.fullName,
    teasers,
    meetingSentence,
    bodyHtml,
    bodyMarkdown: substituted,
  };
}
