// Facebook Pixel — אתחול גלובלי + PageView על כל טעינה של ה-widget.
// אירועי Lead נקראים דרך window.fbq('track', 'Lead') ברגע שיש לנו פרטי משתמש.

import Script from 'next/script';

const PIXEL_ID = '453093447752844';

export function FacebookPixel() {
  return (
    <>
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
fbq('track', 'PageView');
          `.trim(),
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

/** הצהרת type עבור fbq בחלון. */
declare global {
  interface Window {
    fbq?: (action: string, eventName: string, params?: Record<string, unknown>) => void;
  }
}

/** ירייה של אירוע Lead — קריאה ידנית מקוד ה-component כאשר משתמש השאיר פרטים. */
export function trackLead(): void {
  if (typeof window === 'undefined') return;
  if (typeof window.fbq !== 'function') {
    console.warn('[fb-pixel] fbq not initialized yet');
    return;
  }
  try {
    window.fbq('track', 'Lead');
  } catch (err) {
    console.error('[fb-pixel] track Lead failed:', err);
  }
}
