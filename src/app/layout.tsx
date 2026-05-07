import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'שאלון פרופיל משקיע · פניאל נדל"ן',
  description: 'תוך 20 שניות תדע את פרופיל המשקיע שלך — שאלון אישי של פניאל נדל"ן',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
