// GET /api/keepalive
// פינג יומי שמייצר שאילתת SELECT קלה ל-Supabase כדי שהפרויקט לא יושהה
// אחרי 7 ימי חוסר פעילות (Supabase Free Tier).
//
// קורא ע"י Vercel Cron מ-vercel.json — פעם ביום ב-06:00 UTC (09:00 IL).
// Vercel Cron שולח אוטומטית Authorization: Bearer <CRON_SECRET> אם
// CRON_SECRET מוגדר כ-env var. אם לא — כל אחד יכול לקרוא, וזה בסדר
// כי ה-endpoint רק מבצע SELECT count וזה לא חושף כלום.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  // אופציונלי: לוודא שהבקשה היא מ-Vercel Cron (לא חובה — ה-endpoint לא מסוכן)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  try {
    // שאילתת SELECT מינימלית — רק מחזירה count, לא מושכת נתונים
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      service: 'supabase',
      leadsCount: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[keepalive] Supabase ping failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
