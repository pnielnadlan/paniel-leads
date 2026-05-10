// V2 (q2) — layout מינימלי לצ'אטבוט. ייעודי להטמעה ב-iframe.
import './chatbot.css';

export default function Q2Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="chatbot-shell">{children}</div>;
}
