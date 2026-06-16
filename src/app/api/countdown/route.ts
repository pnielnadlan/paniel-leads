// GET /api/countdown
// מייצר GIF מונפש של שעון ספירה-לאחור, להטמעה כתמונה בתוך מיילים (Smoove וכו').
// תוכנות מייל חוסמות JavaScript, ולכן הספירה חייבת להיות תמונה שהשרת מחשב בזמן הבקשה.
//
// פרמטרים (כולם אופציונליים):
//   end     - מועד הסיום. ISO ("2026-06-16T21:00:00+03:00") או unix ms. ברירת מחדל: DEFAULT_END.
//   bg      - צבע רקע hex (ללא #). ברירת מחדל ffffff.
//   box     - צבע הקופסאות hex. ברירת מחדל 011d30 (prussian).
//   digit   - צבע הספרות hex. ברירת מחדל ffffff.
//   label   - צבע התוויות hex. ברירת מחדל 00cccc (cyan).
//   labels  - "1" להצגת שעות/דקות/שניות (ברירת מחדל), "0" להסתרה.
//   frames  - מספר שניות ההנפשה (ברירת מחדל 60).
//
// ההנפשה רצה פעם אחת (~frames שניות) ואז קופאת על הפריים האחרון. בכל פתיחת מייל
// השרת מחשב מחדש את הזמן שנותר. (הערה: Gmail עשוי לשמור את התמונה ב-cache בפתיחה
// הראשונה — מגבלה משותפת לכל שירותי שעוני-המייל.)

import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// דדליין ברירת מחדל לקמפיין הנוכחי: 16.6.2026 בשעה 21:00 שעון ישראל.
const DEFAULT_END = '2026-06-16T21:00:00+03:00';

const FONT_FAMILY = 'Almoni';
let fontReady = false;
function ensureFont(): void {
  if (fontReady) return;
  const fontPath = path.join(process.cwd(), 'src/app/api/countdown/almoni-bold.woff2');
  GlobalFonts.register(readFileSync(fontPath), FONT_FAMILY);
  fontReady = true;
}

function clampHex(value: string | null, fallback: string): string {
  if (value && /^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return fallback;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function roundRect(
  ctx: import('@napi-rs/canvas').SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function GET(request: Request): Promise<Response> {
  ensureFont();

  const { searchParams } = new URL(request.url);

  // פירוק מועד הסיום
  const endParam = searchParams.get('end') ?? DEFAULT_END;
  const endMs = /^\d+$/.test(endParam) ? Number(endParam) : Date.parse(endParam);
  if (Number.isNaN(endMs)) {
    return new Response('Invalid "end" parameter', { status: 400 });
  }

  const bg = clampHex(searchParams.get('bg'), '#ffffff');
  const boxColor = clampHex(searchParams.get('box'), '#011d30');
  const digitColor = clampHex(searchParams.get('digit'), '#ffffff');
  const labelColor = clampHex(searchParams.get('label'), '#00cccc');
  const showLabels = searchParams.get('labels') !== '0';
  const frames = Math.min(Math.max(Number(searchParams.get('frames')) || 60, 1), 120);

  // כמה שניות נותרו עכשיו
  const remainingNow = Math.max(0, Math.floor((endMs - Date.now()) / 1000));

  // מימדים ופריסה
  const labelH = showLabels ? 22 : 0;
  const boxW = 104;
  const boxH = 84;
  const gap = 18; // רווח בין קופסאות (כולל מקום למפריד ":")
  const padX = 6;
  const padY = 10;
  const W = padX * 2 + boxW * 3 + gap * 2;
  const H = padY * 2 + boxH + labelH;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const units: Array<{ label: string }> = [
    { label: 'שעות' },
    { label: 'דקות' },
    { label: 'שניות' },
  ];

  function drawFrame(secondsLeft: number): void {
    // רקע
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    const values = [pad(h), pad(m), pad(s)];

    for (let i = 0; i < 3; i++) {
      const x = padX + i * (boxW + gap);
      const y = padY;

      // קופסה
      ctx.fillStyle = boxColor;
      roundRect(ctx, x, y, boxW, boxH, 14);
      ctx.fill();

      // ספרה
      ctx.fillStyle = digitColor;
      ctx.font = `54px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(values[i], x + boxW / 2, y + boxH / 2 + 2);

      // תווית
      if (showLabels) {
        ctx.fillStyle = labelColor;
        ctx.font = `16px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(units[i].label, x + boxW / 2, y + boxH + labelH / 2 + 1);
      }

      // מפריד ":" בין הקופסאות
      if (i < 2) {
        ctx.fillStyle = boxColor;
        ctx.font = `40px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(':', x + boxW + gap / 2, y + boxH / 2);
      }
    }
  }

  const gif = GIFEncoder();
  const totalFrames = remainingNow <= 0 ? 1 : Math.min(frames, remainingNow + 1);

  for (let i = 0; i < totalFrames; i++) {
    drawFrame(Math.max(0, remainingNow - i));
    const { data } = ctx.getImageData(0, 0, W, H);
    const palette = quantize(data, 256, { format: 'rgb565' });
    const index = applyPalette(data, palette, 'rgb565');
    gif.writeFrame(index, W, H, {
      palette,
      delay: 1000, // אלפיות שנייה לפריים = שנייה
      repeat: i === 0 ? -1 : undefined, // -1 = ניגון פעם אחת (ללא לולאה)
    });
  }
  gif.finish();

  const bytes = gif.bytes();
  const body = new Uint8Array(bytes);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
