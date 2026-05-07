// אינטגרציה עם Smoove REST API.
// תיעוד: https://rest.smoove.io/swagger/ui/index
//
// אם SMOOVE_API_KEY חסר — לוג בלבד (פיתוח). ב-prod חובה.

import {
  type CapitalRange,
  SMOOVE_CAPITAL_LABELS,
} from '@/data/questions';

const SMOOVE_API_BASE = 'https://rest.smoove.io/v1';
const API_KEY = process.env.SMOOVE_API_KEY;
const MEETING_LIST_ID = Number(process.env.SMOOVE_MEETING_LIST_ID ?? 968406);

// Keys של ה-Custom Fields ב-Smoove. ה-IDs הם בפורמט "iN" (לא רק המספר).
// אומתו דרך GET /v1/Account/ContactFields.
const FIELD_CAPITAL = 'i1';        // dropDownList — "הסכום הזמין להשקעה"
const FIELD_HAS_PROPERTY = 'i18';  // boolean — "האם יש דירה בבעלותכם?"
const FIELD_REPORT_URL = 'i19';    // text — "קישור לדוח"

export const smooveConfigured = Boolean(API_KEY);

export type SmoveSyncInput = {
  email: string;
  fullName: string;
  phone?: string;
  capitalRange: CapitalRange;
  hasExistingProperty: boolean;
  reportUrl: string;
  wantsMeeting: boolean;
};

/**
 * מסנכרן ליד ל-Smoove: יוצר/מעדכן contact עם השדות הרלוונטיים,
 * ואם wantsMeeting — מוסיף לרשימה 968406.
 */
export async function syncContactToSmoove(input: SmoveSyncInput): Promise<void> {
  // פיצול השם המלא ל-firstName / lastName בצורה פשוטה (Smoove דורש)
  const trimmed = input.fullName.trim();
  const spaceIdx = trimmed.indexOf(' ');
  const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

  // i18 הוא booleanItem — שולחים true/false ולא טקסט עברי
  const customFields: Record<string, string | boolean> = {
    [FIELD_CAPITAL]: SMOOVE_CAPITAL_LABELS[input.capitalRange],
    [FIELD_HAS_PROPERTY]: input.hasExistingProperty,
    [FIELD_REPORT_URL]: input.reportUrl,
  };

  // נורמליזציה של מס' טלפון: נקה רווחים/מקפים, השאר רק ספרות + +
  const cleanPhone = input.phone?.replace(/[^\d+]/g, '') || undefined;

  const body: Record<string, unknown> = {
    email: input.email,
    firstName,
    lastName,
    customFields,
    lists_ToSubscribe: input.wantsMeeting ? [MEETING_LIST_ID] : [],
  };
  if (cleanPhone) {
    // Smoove תומך ב-mobile (cellPhone) — הפורמט המומלץ למובייל ישראלי
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
