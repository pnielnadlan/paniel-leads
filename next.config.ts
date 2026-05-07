import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // החבילות האלה מטעינות בינארים גדולים ולא צריכות לעבור bundling של Next.js.
  // הן ייטענו ישירות מ-node_modules בזמן ריצה.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
};

export default nextConfig;
