// Supabase client + helper להעלאת PDF.
// אם משתני הסביבה לא מוגדרים — נופל ל-fallback מקומי (לתיקיית tmp/) כדי
// שהפיתוח ימשיך לעבוד גם בלי credentials. ב-prod הם חובה.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_REPORTS_BUCKET ?? 'reports';

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

export const supabaseConfigured = supabase !== null;

/**
 * מעלה PDF ל-Supabase Storage ומחזיר Public URL.
 * בלי credentials — שומר מקומית ומחזיר file:// URL (לפיתוח בלבד).
 */
export async function uploadReportPdf(params: {
  pdf: Buffer;
  reportId: string;
  email: string;
}): Promise<string> {
  const filename = `${Date.now()}-${params.reportId}-${slugifyEmail(params.email)}.pdf`;

  if (!supabase) {
    // Fallback מקומי — לפיתוח לפני שיש Supabase
    const fs = await import('node:fs');
    const path = await import('node:path');
    const tmpDir = path.join(process.cwd(), 'tmp', 'submissions');
    fs.mkdirSync(tmpDir, { recursive: true });
    const fullPath = path.join(tmpDir, filename);
    fs.writeFileSync(fullPath, params.pdf);
    console.warn(
      '[supabase] Not configured — saved locally to',
      fullPath,
      '(set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for cloud upload)',
    );
    return `file://${fullPath}`;
  }

  const { error } = await supabase.storage.from(BUCKET).upload(filename, params.pdf, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

function slugifyEmail(email: string): string {
  return email.replace(/[^a-zA-Z0-9]/g, '_');
}
