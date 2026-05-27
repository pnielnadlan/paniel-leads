// POST /api/resync-smoove
// מסנכרן מחדש לידים שנפלו בסנכרון הראשוני ל-Smoove.
// קורא את כל הלידים עם smoove_status='failed' או 'pending', ומריץ עליהם
// syncContactToSmoove שוב — אם הצליח מעדכן ל-ok, אחרת משאיר failed עם הודעה.
//
// אבטחה: דורש header Authorization: Bearer <RESYNC_SECRET> שתואם ל-ENV.
// אם RESYNC_SECRET לא מוגדר — endpoint זה לא יעבוד (מחזיר 503).

import { NextResponse } from 'next/server';
import { syncContactToSmoove } from '@/lib/smoove';
import { fetchFailedLeads, markLeadSynced, markLeadFailed } from '@/lib/leads-db';
import type { CapitalRange } from '@/data/questions';
import type { CapitalRange as Q2CapitalRange } from '@/data/questions-q2';

export const maxDuration = 60;
export const runtime = 'nodejs';

type ResyncReport = {
  ok: true;
  total: number;
  synced: number;
  failed: number;
  details: Array<{ id: string; email: string; status: 'ok' | 'failed'; error?: string }>;
};

export async function POST(request: Request): Promise<NextResponse<ResyncReport | { error: string }>> {
  const secret = process.env.RESYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'RESYNC_SECRET not configured' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const failed = await fetchFailedLeads(200);
  const details: ResyncReport['details'] = [];
  let synced = 0;
  let failedCount = 0;

  for (const lead of failed) {
    try {
      await syncContactToSmoove({
        questionnaireId: lead.questionnaire_id,
        email: lead.email,
        fullName: lead.full_name,
        phone: lead.phone,
        capitalRange: lead.capital_range as CapitalRange | Q2CapitalRange | undefined,
        hasExistingProperty: lead.has_existing_property,
        reportUrl: lead.report_url ?? '',
        wantsMeeting: lead.wants_meeting,
        marketingConsent: true,
      });
      await markLeadSynced(lead.id);
      synced += 1;
      details.push({ id: lead.id, email: lead.email, status: 'ok' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markLeadFailed(lead.id, msg);
      failedCount += 1;
      details.push({ id: lead.id, email: lead.email, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    total: failed.length,
    synced,
    failed: failedCount,
    details,
  });
}
