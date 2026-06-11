// Facebook Pixel — אתחול בלבד (PageView נורה ע"י הפיקסל בעמוד הנחיתה
// של הלקוח). אירועי Lead נקראים דרך window.fbq('track', 'Lead') ברגע
// שיש לנו פרטי משתמש. בכוונה לא יורים PageView מכאן כדי לא לכפול את
// האירוע שכבר נורה מ-iframe-parent.

import Script from 'next/script';

const PIXEL_ID = '254016845704155';

export function FacebookPixel() {
  return (
    <Script
      id="fb-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
        `.trim(),
      }}
    />
  );
}

/** הצהרת type עבור fbq בחלון. */
declare global {
  interface Window {
    fbq?: (action: string, eventName: string, params?: Record<string, unknown>) => void;
  }
}

/**
 * ירייה של אירוע Lead — נקרא ברגע שמשתמש השאיר פרטים.
 *
 * חשוב: התרחיש הרגיל הוא iframe מוטמע ב-pnielnadlan.co.il. ה-snippet
 * ב-Elementor של ההורה מקבל את postMessage ויורה fbq על הדומיין הנכון
 * (מיוחס לקמפיין). לכן ה-iframe עצמו לא יורה fbq — אחרת זה היה כפול
 * ב-Meta (גם ההורה גם ה-iframe, ושני האירועים מיוחסים לדומיין ההורה
 * כי ה-Referer של בקשות ה-fbq מתוך iframe = ה-URL של ההורה).
 *
 * רק במקרה הנדיר שמישהו פותח את הצ'אט ישירות (לא דרך iframe) — נורה
 * מקומית כ-fallback.
 */
export function trackLead(): void {
  if (typeof window === 'undefined') return;

  const isInIframe = window.parent && window.parent !== window;

  if (isInIframe) {
    // ההורה אחראי לירייה — אנחנו רק שולחים postMessage
    try {
      window.parent.postMessage({ type: 'paniel-lead' }, '*');
    } catch (err) {
      console.error('[fb-pixel] postMessage to parent failed:', err);
    }
    return;
  }

  // standalone: יורים מקומית
  if (typeof window.fbq === 'function') {
    try {
      window.fbq('track', 'Lead');
    } catch (err) {
      console.error('[fb-pixel] local track Lead failed:', err);
    }
  }
}
