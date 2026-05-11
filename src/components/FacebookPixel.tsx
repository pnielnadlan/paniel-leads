// Facebook Pixel — אתחול בלבד (PageView נורה ע"י הפיקסל בעמוד הנחיתה
// של הלקוח). אירועי Lead נקראים דרך window.fbq('track', 'Lead') ברגע
// שיש לנו פרטי משתמש. בכוונה לא יורים PageView מכאן כדי לא לכפול את
// האירוע שכבר נורה מ-iframe-parent.

import Script from 'next/script';

const PIXEL_ID = '453093447752844';

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
 * אסטרטגיה דו-שלבית:
 * 1) postMessage לאתר ההורה (Elementor) → קוד ה-snippet שם קורא ל-fbq.
 *    זה הנכון לקמפיינים: האירוע מיוחס לדומיין של עמוד הנחיתה.
 * 2) Fallback מקומי — נורה גם ב-iframe עצמו, למקרה שהמשתמש פתח את הצ'אט
 *    ישירות (לא דרך iframe), או שהאתר ההורה לא הטמיע listener.
 */
export function trackLead(): void {
  if (typeof window === 'undefined') return;

  // 1) postMessage לאתר ההורה
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'paniel-lead' }, '*');
    }
  } catch {
    // cross-origin postMessage נכשל — נמשיך ל-fallback
  }

  // 2) Fallback: fire fbq local
  if (typeof window.fbq === 'function') {
    try {
      window.fbq('track', 'Lead');
    } catch (err) {
      console.error('[fb-pixel] local track Lead failed:', err);
    }
  }
}
