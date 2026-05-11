// אינטגרציה עם Smoove REST API.
// תיעוד: https://rest.smoove.io/swagger/ui/index
//
// כל ליד נכנס לרשימה לפי השאלון:
//   q1 → list 1135210 (שאלון A)
//   q2 → list 1135211 (שאלון B)
// בנוסף לרשימה, מסומנים הערכים הבאים ב-Custom Fields:
//   i1  — טווח הון עצמי (dropdown)
//   i18 — האם יש דירה בבעלות? (boolean)
//   i19 — קישור לדוח A (q1 בלבד)
//   i20 — תיוג שאלון: "q1" / "q2"
//   i21 — קישור לדוח B (q2 בלבד)
//   i22 — האם מבקש שיחת פיצוח? "כן" / "לא" (dropdown)

import {
  type CapitalRange,
  SMOOVE_CAPITAL_LABELS,
} from '@/data/questions';
import {
  type CapitalRange as Q2CapitalRange,
  Q2_SMOOVE_CAPITAL_LABELS,
} from '@/data/questions-q2';

const SMOOVE_API_BASE = 'https://rest.smoove.io/v1';
const API_KEY = process.env.SMOOVE_API_KEY;

// רשימות לפי שאלון. ה-ENV vars מאפשרים override אם בעתיד יוחלפו.
const Q1_LIST_ID = Number(process.env.SMOOVE_Q1_LIST_ID ?? 1135210);
const Q2_LIST_ID = Number(process.env.SMOOVE_Q2_LIST_ID ?? 1135211);

// Custom Field IDs ב-Smoove (פורמט "iN", אומתו דרך GET /v1/Account/ContactFields).
const FIELD_CAPITAL = 'i1';          // dropDownList — הסכום הזמין להשקעה
const FIELD_HAS_PROPERTY = 'i18';    // boolean — האם יש דירה בבעלותכם?
const FIELD_REPORT_URL_A = 'i19';    // text — קישור לדוח A (q1)
const FIELD_QUESTIONNAIRE = 'i20';   // text — q1 / q2
const FIELD_REPORT_URL_B = 'i21';    // text — קישור לדוח B (q2)
const FIELD_WANTS_MEETING = 'i22';   // boolean — מעוניין בפגישה? (Smoove דורש true/false)

export const smooveConfigured = Boolean(API_KEY);

export type SmoveSyncInput = {
  questionnaireId: 'q1' | 'q2';
  email: string;
  fullName: string;
  phone?: string;
  capitalRange?: CapitalRange | Q2CapitalRange;
  hasExistingProperty?: boolean;
  reportUrl: string;
  /** האם המשתמש בחר באופציית "שיחת פיצוח" (תחת i22 + רידיירקט לעמוד תודה). */
  wantsMeeting: boolean;
  marketingConsent: boolean;
};

/**
 * מסנכרן ליד ל-Smoove:
 *   - מוסיף לרשימת השאלון המתאימה (1135210 ל-q1, 1135211 ל-q2)
 *   - מעדכן Custom Fields: i1, i18 (אם רלוונטי), i19/i21, i20, i22
 */
export async function syncContactToSmoove(input: SmoveSyncInput): Promise<void> {
  const trimmed = input.fullName.trim();
  const spaceIdx = trimmed.indexOf(' ');
  const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

  const customFields: Record<string, string | boolean> = {
    [FIELD_QUESTIONNAIRE]: input.questionnaireId,
    [FIELD_WANTS_MEETING]: input.wantsMeeting, // booleanItem — true/false
  };

  // i1 — capital range
  if (input.capitalRange) {
    const label =
      input.questionnaireId === 'q2'
        ? Q2_SMOOVE_CAPITAL_LABELS[input.capitalRange as Q2CapitalRange]
        : SMOOVE_CAPITAL_LABELS[input.capitalRange as CapitalRange];
    customFields[FIELD_CAPITAL] = label;
  }

  // i18 — has property (זמין בשני השאלונים; q2 שואב מ-Q1)
  if (input.hasExistingProperty !== undefined) {
    customFields[FIELD_HAS_PROPERTY] = input.hasExistingProperty;
  }

  // i19 (q1) / i21 (q2) — קישור לדוח לפי השאלון
  if (input.questionnaireId === 'q1') {
    customFields[FIELD_REPORT_URL_A] = input.reportUrl;
  } else {
    customFields[FIELD_REPORT_URL_B] = input.reportUrl;
  }

  // רשימה לפי השאלון — תמיד מוסיפים, ללא תלות ב-wantsMeeting
  const listId = input.questionnaireId === 'q1' ? Q1_LIST_ID : Q2_LIST_ID;

  // נורמליזציה של מס' טלפון
  const cleanPhone = input.phone?.replace(/[^\d+]/g, '') || undefined;

  const body: Record<string, unknown> = {
    email: input.email,
    firstName,
    lastName,
    customFields,
    lists_ToSubscribe: [listId],
    canReceiveEmails: input.marketingConsent,
  };
  if (cleanPhone) {
    body.mobile = cleanPhone;
  }

  if (!API_KEY) {
    console.warn('[smoove] Not configured — would have sent:', body);
    return;
  }

  const url = `${SMOOVE_API_BASE}/Contacts?updateIfExists=true&restoreIfUnsubscribed=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Smoove API ${res.status}: ${text || res.statusText}`);
  }
}
