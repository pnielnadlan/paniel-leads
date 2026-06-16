import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // החבילות האלה מטעינות בינארים גדולים ולא צריכות לעבור bundling של Next.js.
  // הן ייטענו ישירות מ-node_modules בזמן ריצה.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core', '@napi-rs/canvas'],

  // serverExternalPackages לבדו לא מספיק עבור @sparticuz/chromium —
  // ה-bin/ של Chromium לא נכלל בעקבות trace אוטומטי. מכריחים את Next.js
  // להעתיק את ה-bin הזה ל-Lambda function deployment.
  outputFileTracingIncludes: {
    '/api/submit': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    // הפונט נטען מהדיסק בזמן ריצה — מכריחים את Next.js לכלול אותו ב-Lambda.
    '/api/countdown': ['./src/app/api/countdown/almoni-bold.woff2'],
  },
};

export default nextConfig;
