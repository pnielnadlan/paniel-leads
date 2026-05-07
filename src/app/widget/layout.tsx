// layout מינימלי לרוט /widget — ללא header/footer, ללא chrome.
// מתוכנן להטמעה ב-iframe (Elementor, וכו'), אבל גם מציג נכון בגלישה ישירה.
import './widget.css';

export default function WidgetLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="widget-shell">{children}</div>;
}
