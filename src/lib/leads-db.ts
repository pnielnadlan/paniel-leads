// טבלת leads ב-Supabase — safety net לפני שליחה ל-Smoove.
// המטרה: גם אם Smoove נופל (או הקוד שלנו שובר את ה-payload), הליד נשמר אצלנו
// ונוכל לסנכרן בדיעבד דרך /api/resync-smoove.
//
// יצירת הטבלה (להריץ ידנית פעם אחת ב-Supabase SQL editor):
//
//   create table public.leads (
//     id uuid primary key default gen_random_uuid(),
//     created_at timestamptz not null default now(),
//     questionnaire_id text not null,            -- 'q1' | 'q2'
//     audience text,                             -- 'single' | 'couple' | 'family' (q2 only)
//     email text not null,
//     full_name text not null,
//     first_name text,                           -- נוסף ב-2026-07 יחד עם פיצול השם
//     last_name text,
//     phone text,
//     wants_meeting boolean not null default false,
//     answers jsonb not null,
//     report_id text,
//     report_url text,
//     capital_range text,
//     has_existing_property boolean,
//     smoove_status text not null default 'pending',  -- 'pending' | 'ok' | 'failed'
//     smoove_error text,
//     smoove_synced_at timestamptz
//   );
//   create index leads_smoove_status_idx on public.leads (smoove_status);
//   create index leads_email_idx on public.leads (email);
//
// Migration להוספת first_name + last_name לטבלה קיימת:
//   alter table public.leads add column if not exists first_name text;
//   alter table public.leads add column if not exists last_name text;

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

export const leadsDbConfigured = supabase !== null;

export type LeadRow = {
  id: string;
  created_at: string;
  questionnaire_id: 'q1' | 'q2';
  audience?: string;
  email: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  wants_meeting: boolean;
  answers: Record<string, string>;
  report_id?: string;
  report_url?: string;
  capital_range?: string;
  has_existing_property?: boolean;
  smoove_status: 'pending' | 'ok' | 'failed';
  smoove_error?: string;
  smoove_synced_at?: string;
};

export type LeadInsert = Omit<
  LeadRow,
  'id' | 'created_at' | 'smoove_status' | 'smoove_error' | 'smoove_synced_at'
>;

/** מכניס ליד חדש ב-status='pending'. מחזיר את ה-id. */
export async function insertLead(lead: LeadInsert): Promise<string | null> {
  if (!supabase) {
    console.warn('[leads-db] Not configured — lead not persisted:', lead.email);
    return null;
  }
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...lead, smoove_status: 'pending' })
    .select('id')
    .single();
  if (error) {
    console.error('[leads-db] insertLead failed:', error.message);
    return null;
  }
  return data.id;
}

/** מסמן ליד כסונכרן בהצלחה. */
export async function markLeadSynced(leadId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('leads')
    .update({
      smoove_status: 'ok',
      smoove_error: null,
      smoove_synced_at: new Date().toISOString(),
    })
    .eq('id', leadId);
  if (error) console.error('[leads-db] markLeadSynced failed:', error.message);
}

/** מסמן ליד ככשול עם הודעת שגיאה. */
export async function markLeadFailed(leadId: string, errMsg: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('leads')
    .update({
      smoove_status: 'failed',
      smoove_error: errMsg.slice(0, 1000),
    })
    .eq('id', leadId);
  if (error) console.error('[leads-db] markLeadFailed failed:', error.message);
}

/** שולף לידים שלא הסתנכרנו (status='failed' או 'pending' ישן). */
export async function fetchFailedLeads(limit = 100): Promise<LeadRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .in('smoove_status', ['failed', 'pending'])
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[leads-db] fetchFailedLeads failed:', error.message);
    return [];
  }
  return data as LeadRow[];
}
