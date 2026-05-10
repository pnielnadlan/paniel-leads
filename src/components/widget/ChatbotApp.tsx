'use client';

// V2 (q2) — צ'אטבוט בסגנון WhatsApp/Typebot.
// מודל: כל פריט אינטראקטיבי (אופציות, שדה טקסט, צ'קבוקס, כפתור שליחה)
// יושב ב-transcript עצמו — אין "input area" קבוע למטה.
// בוט בצד ימין (לבן עם קונטור), משתמש בצד שמאל (ברנד מלא).
// אנימציה: כל בועה נכנסת עם ציור הקונטור מלמעלה למטה (clip-path).

import { useEffect, useRef, useState } from 'react';
import {
  Q2_QUESTIONS,
  Q12_FA,
  Q12_FB,
  AUDIENCE_QUESTION,
  INTRO_BUBBLES,
  START_BUTTON_LABEL,
  SOFT_FRAMING_INTRO,
  SOFT_FRAMING_TAIL_BY_MOTIVATION,
  ENDING_ACTIVE,
  ENDING_SOFT,
  Q2_REPORT_NAMES,
  pickVariant,
  type AudienceVariant,
  type OptionId,
  type Q2Question,
  type Motivation,
} from '@/data/questions-q2';
import { Q2_REPORTS } from '@/data/reports-q2';
import { scoreQ2Submission, type Q2Answers } from '@/lib/scoring-q2';

/** פריט בטרנסקריפט. הקבוצות "החיות" (אופציות / input / מטא-בחירה) הופכות
 *  ל-bubble-user סטטית אחרי שהמשתמש בוחר. */
type Item =
  | { kind: 'hero'; key: string }
  | { kind: 'bot'; text: string; key: string }
  | { kind: 'user'; text: string; key: string }
  | {
      kind: 'options';
      key: string;
      options: { id: string; text: string }[];
      onPick: (id: string) => void;
    }
  | {
      kind: 'start';
      key: string;
      label: string;
      onPick: () => void;
    }
  | {
      kind: 'input';
      key: string;
      type: 'email' | 'text' | 'tel';
      placeholder: string;
      validate: (v: string) => boolean;
      onSubmit: (v: string) => void;
    }
  | {
      kind: 'meeting-choice';
      key: string;
      onSubmit: (wantsMeeting: boolean) => void;
    }
  | { kind: 'loading'; text: string; key: string }
  | {
      kind: 'result';
      key: string;
      eyebrow: string;
      title: string;
      text: string;
    }
  | { kind: 'error'; text: string; key: string };

export function ChatbotApp() {
  const [items, setItems] = useState<Item[]>([]);
  const [audience, setAudience] = useState<AudienceVariant | null>(null);
  // נשמר לקריאת התשובות האחרונות בתוך handlers (state stale-closure)
  const answersRef = useRef<Q2Answers>(new Map());
  const audienceRef = useRef<AudienceVariant | null>(null);
  const emailRef = useRef('');
  const fullNameRef = useRef('');
  const phoneRef = useRef('');
  const wantsMeetingRef = useRef<boolean>(false);
  const endingActiveRef = useRef<boolean>(false);

  // Auto-scroll לתחתית רק אחרי האינטראקציה הראשונה (אחרת נפספס את הפתיח)
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hasInteractedRef = useRef(false);
  useEffect(() => {
    if (!hasInteractedRef.current) return;
    const el = transcriptRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [items]);

  // ─── append helpers ────────────────────────────────────────────────────
  const append = (item: Item) => setItems((arr) => [...arr, item]);

  const appendBot = (text: string, delay = 0) => {
    const key = `bot-${Date.now()}-${Math.random()}`;
    if (delay > 0) {
      setTimeout(() => append({ kind: 'bot', text, key }), delay);
    } else {
      append({ kind: 'bot', text, key });
    }
  };

  const appendUser = (text: string) => {
    const key = `user-${Date.now()}-${Math.random()}`;
    append({ kind: 'user', text, key });
  };

  /** מחליף item אינטראקטיבי בבועת user (אחרי בחירה). */
  const resolveItem = (key: string, userText: string) => {
    setItems((arr) =>
      arr.map((it) =>
        it.key === key
          ? ({ kind: 'user', text: userText, key: it.key } as Item)
          : it,
      ),
    );
  };

  // ─── זרימה: בועות פתיחה (ב-mount) ──────────────────────────────────────
  // הספק ביקש: כל הברכה כהודעה אחת ארוכה (היי...להתאים לכם יותר), ואז
  // "שנתחיל?" כהודעה קצרה, ואז כפתור "בואו נתחיל" כבועה משמאל עם נקודת התראה.
  const introInitialized = useRef(false);
  useEffect(() => {
    if (introInitialized.current) return;
    introInitialized.current = true;
    // INTRO_BUBBLES = 6 פריטים. נאחד את 5 הראשונים (החל מ"היי" ועד "להתאים לכם יותר")
    const longIntro = INTRO_BUBBLES.slice(0, 5).join('\n\n');
    const startQuestion = INTRO_BUBBLES[5]; // "שנתחיל?"
    setItems([
      { kind: 'hero', key: 'hero' },
      { kind: 'bot', text: longIntro, key: 'intro-long' },
      { kind: 'bot', text: startQuestion, key: 'intro-start-q' },
      {
        kind: 'start',
        key: 'start-btn',
        label: START_BUTTON_LABEL,
        onPick: () => handleStart(),
      },
    ]);
  }, []);

  // ─── handler: התחלה ────────────────────────────────────────────────────
  const handleStart = () => {
    hasInteractedRef.current = true;
    resolveItem('start-btn', START_BUTTON_LABEL);
    appendBot(AUDIENCE_QUESTION.text);
    appendAudienceOptions();
  };

  const appendAudienceOptions = () => {
    const key = `audience-${Date.now()}`;
    append({
      kind: 'options',
      key,
      options: AUDIENCE_QUESTION.options.map((o) => ({ id: o.id, text: o.text })),
      onPick: (id) => {
        const opt = AUDIENCE_QUESTION.options.find((o) => o.id === id)!;
        audienceRef.current = opt.variant;
        setAudience(opt.variant);
        resolveItem(key, opt.text);
        askQuestion('Q1', opt.variant);
      },
    });
  };

  // ─── helper: שאלה רגילה ─────────────────────────────────────────────────
  const askQuestion = (qid: string, aud: AudienceVariant) => {
    const q = findQuestion(qid);
    appendBot(pickVariant(q.text, aud));
    const key = `opt-${qid}-${Date.now()}`;
    append({
      kind: 'options',
      key,
      options: q.options.map((o) => ({ id: o.id, text: pickVariant(o.text, aud) })),
      onPick: (id) => {
        const opt = q.options.find((o) => o.id === id)!;
        const newAnswers = new Map(answersRef.current);
        newAnswers.set(qid, opt.id as OptionId);
        answersRef.current = newAnswers;
        resolveItem(key, pickVariant(opt.text, aud));
        advanceFlow(qid, opt.id as OptionId);
      },
    });
  };

  // ─── זרימה: התקדמות אחרי תשובה ──────────────────────────────────────────
  const advanceFlow = (currentQid: string, currentOid: OptionId) => {
    const aud = audienceRef.current;
    if (!aud) return;
    const ans = answersRef.current;

    const linearOrder = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11'];
    const idx = linearOrder.indexOf(currentQid);
    if (idx >= 0 && idx < linearOrder.length - 1) {
      askQuestion(linearOrder[idx + 1], aud);
      return;
    }
    if (currentQid === 'Q11') {
      askQuestion('Q12', aud);
      return;
    }

    if (currentQid === 'Q12') {
      if (currentOid === 'A') {
        appendBot(pickVariant(Q12_FA.text, aud));
        const key = `opt-Q12FA-${Date.now()}`;
        append({
          kind: 'options',
          key,
          options: Q12_FA.options.map((o) => ({ id: o.id, text: pickVariant(o.text, aud) })),
          onPick: (id) => {
            const opt = Q12_FA.options.find((o) => o.id === id)!;
            const newAns = new Map(answersRef.current);
            newAns.set('Q12_FA', opt.id as OptionId);
            answersRef.current = newAns;
            resolveItem(key, pickVariant(opt.text, aud));
            advanceFlow('Q12_FA', opt.id as OptionId);
          },
        });
      } else {
        showSoftFraming(ans);
      }
      return;
    }

    if (currentQid === 'Q12_FA') {
      if (currentOid === 'C') {
        showSoftFraming(ans);
      } else {
        askQuestion('Q13', aud);
      }
      return;
    }

    if (currentQid === 'Q12_FB') {
      if (currentOid === 'C') {
        finishConversation(false);
      } else {
        askQuestion('Q13', aud);
      }
      return;
    }

    if (currentQid === 'Q13') {
      const isActive = currentOid === 'A' || currentOid === 'B';
      finishConversation(isActive);
      return;
    }
  };

  // ─── מסך ריכוך + Q12_FB ─────────────────────────────────────────────────
  const showSoftFraming = (ans: Q2Answers) => {
    const aud = audienceRef.current;
    if (!aud) return;
    appendBot(pickVariant(SOFT_FRAMING_INTRO, aud));
    const q9opt = ans.get('Q9');
    const q9 = Q2_QUESTIONS.find((q) => q.id === 'Q9')!;
    const motivation =
      (q9opt && q9.options.find((o) => o.id === q9opt)?.motivation) ?? 'smarter_money';
    appendBot(pickVariant(SOFT_FRAMING_TAIL_BY_MOTIVATION[motivation as Motivation], aud));
    appendBot(pickVariant(Q12_FB.text, aud));
    const key = `opt-Q12FB-${Date.now()}`;
    append({
      kind: 'options',
      key,
      options: Q12_FB.options.map((o) => ({ id: o.id, text: pickVariant(o.text, aud) })),
      onPick: (id) => {
        const opt = Q12_FB.options.find((o) => o.id === id)!;
        const newAns = new Map(answersRef.current);
        newAns.set('Q12_FB', opt.id as OptionId);
        answersRef.current = newAns;
        resolveItem(key, pickVariant(opt.text, aud));
        advanceFlow('Q12_FB', opt.id as OptionId);
      },
    });
  };

  // ─── סיום שאלות, מעבר לאיסוף פרטים ─────────────────────────────────────
  const finishConversation = (active: boolean) => {
    const aud = audienceRef.current;
    if (!aud) return;
    endingActiveRef.current = active;
    appendBot(pickVariant(active ? ENDING_ACTIVE : ENDING_SOFT, aud));
    appendBot(pickVariant(EMAIL_PROMPT, aud));
    appendInput('email', 'name@example.com', isEmailValid, (v) => {
      emailRef.current = v;
      appendBot(pickVariant(NAME_PROMPT, aud));
      appendInput('text', 'שם מלא', isNameValid, (val) => {
        fullNameRef.current = val.trim();
        appendBot(pickVariant(PHONE_PROMPT, aud));
        appendInput('tel', '050-1234567', isPhoneValid, (p) => {
          phoneRef.current = p;
          // עכשיו שני "צ'קבוקס" כבועות + כפתור שליחה
          appendMeetingChoice();
        });
      });
    });
  };

  const appendInput = (
    type: 'email' | 'text' | 'tel',
    placeholder: string,
    validate: (v: string) => boolean,
    onSubmit: (v: string) => void,
  ) => {
    const key = `input-${type}-${Date.now()}-${Math.random()}`;
    append({
      kind: 'input',
      key,
      type,
      placeholder,
      validate,
      onSubmit: (v) => {
        resolveItem(key, v);
        onSubmit(v);
      },
    });
  };

  const appendMeetingChoice = () => {
    const key = `meeting-${Date.now()}`;
    append({
      kind: 'meeting-choice',
      key,
      onSubmit: async (wantsMeeting) => {
        wantsMeetingRef.current = wantsMeeting;
        const chosenLabel = wantsMeeting
          ? 'אשמח שתשלחו לי את הדוח המלא וגם תחזרו אליי לשיחת פיצוח'
          : 'אשמח שתשלחו לי את הדוח המלא';
        resolveItem(key, chosenLabel);
        await submitToServer();
      },
    });
  };

  // ─── שליחה לשרת ────────────────────────────────────────────────────────
  const submitToServer = async () => {
    const aud = audienceRef.current;
    if (!aud) return;
    const loadingKey = `loading-${Date.now()}`;
    append({
      kind: 'loading',
      key: loadingKey,
      text: 'מנתחים את התשובות שלכם ומפיקים את הדוח האישי…',
    });

    const result = scoreQ2Submission(answersRef.current);

    try {
      const payload = {
        questionnaireId: 'q2',
        audience: aud,
        answers: Object.fromEntries(answersRef.current),
        email: emailRef.current,
        fullName: fullNameRef.current,
        phone: phoneRef.current,
        wantsMeeting: wantsMeetingRef.current,
      };
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'שגיאה לא צפויה' }));
        throw new Error(err.error || 'השליחה נכשלה');
      }

      // הסרת בועת ה"טוען" + הופעת התוצאה
      setItems((arr) => arr.filter((it) => it.key !== loadingKey));
      const reportContent = Q2_REPORTS[result.selectedReport];
      append({
        kind: 'result',
        key: `result-${Date.now()}`,
        eyebrow: 'הניתוח שלכם מוכן',
        title: Q2_REPORT_NAMES[result.selectedReport],
        text: reportContent.simulatorOutput,
      });
    } catch (err) {
      setItems((arr) => arr.filter((it) => it.key !== loadingKey));
      append({
        kind: 'error',
        key: `err-${Date.now()}`,
        text: err instanceof Error ? err.message : 'שגיאה לא צפויה',
      });
    }
  };

  // ─── רינדור ─────────────────────────────────────────────────────────────
  return (
    <div className="chatbot-root">
      <div className="chat-brandbar">
        <span className="chat-brandbar-name">פניאל נדל״ן · סימולטור משקיע</span>
      </div>
      <div className="chat-transcript" ref={transcriptRef}>
        {items.map((it) => renderItem(it, audience))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderItem(it: Item, audience: AudienceVariant | null) {
  switch (it.kind) {
    case 'hero':
      return (
        <div key={it.key} className="chat-hero">
          <img src="/q2/hero.jpg" alt="צוות פניאל נדל״ן" />
        </div>
      );
    case 'bot':
      return (
        <div key={it.key} className="bubble-bot">
          {it.text}
        </div>
      );
    case 'user':
      return (
        <div key={it.key} className="bubble-user">
          {it.text}
        </div>
      );
    case 'options':
      return (
        <div key={it.key} className="bubble-options">
          {it.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="bubble-option-btn"
              onClick={() => it.onPick(o.id)}
            >
              {o.text}
            </button>
          ))}
        </div>
      );
    case 'start':
      return (
        <div key={it.key} className="start-bubble-wrap">
          <button type="button" className="start-bubble-btn" onClick={it.onPick}>
            {it.label}
          </button>
          <span className="start-bubble-dot" aria-label="לחיצה נדרשת">
            !
          </span>
        </div>
      );
    case 'input':
      return <InputBubble key={it.key} item={it} />;
    case 'meeting-choice':
      return <MeetingChoice key={it.key} item={it} />;
    case 'loading':
      return (
        <div key={it.key} className="bubble-loading">
          <span className="bubble-loading-spinner" aria-hidden="true" />
          <span>{it.text}</span>
        </div>
      );
    case 'result':
      return (
        <div key={it.key} className="bubble-result">
          <div className="bubble-result-eyebrow">{it.eyebrow}</div>
          <h3 className="bubble-result-title">{it.title}</h3>
          <div className="bubble-result-body">{it.text}</div>
        </div>
      );
    case 'error':
      return (
        <div key={it.key} className="chat-error">
          {it.text}
        </div>
      );
    default:
      // exhaustive check
      void audience;
      return null;
  }
}

/** input bubble — שדה טקסט עם כפתור "שליחה" משמאל. */
function InputBubble({
  item,
}: {
  item: Extract<Item, { kind: 'input' }>;
}) {
  const [value, setValue] = useState('');
  const ok = item.validate(value);
  return (
    <div className="bubble-input">
      <input
        type={item.type}
        dir={item.type === 'email' || item.type === 'tel' ? 'ltr' : 'rtl'}
        inputMode={item.type === 'tel' ? 'tel' : undefined}
        className="bubble-input-field"
        placeholder={item.placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ok) item.onSubmit(value);
        }}
        autoFocus
      />
      <button
        type="button"
        className="bubble-input-send"
        onClick={() => item.onSubmit(value)}
        disabled={!ok}
      >
        שליחה
      </button>
    </div>
  );
}

/** מסך הצ'קבוקס: שתי בועות (פגישה / רק דוח) + כפתור "שליחה". */
function MeetingChoice({
  item,
}: {
  item: Extract<Item, { kind: 'meeting-choice' }>;
}) {
  const [picked, setPicked] = useState<'with-meeting' | 'report-only' | null>(null);
  return (
    <>
      <div className="bubble-options">
        <button
          type="button"
          className="bubble-option-btn"
          onClick={() => setPicked('with-meeting')}
          style={picked === 'with-meeting' ? selectedStyle : undefined}
        >
          אשמח שתשלחו לי את הדוח המלא וגם תחזרו אליי לשיחת פיצוח
        </button>
        <button
          type="button"
          className="bubble-option-btn"
          onClick={() => setPicked('report-only')}
          style={picked === 'report-only' ? selectedStyle : undefined}
        >
          אשמח שתשלחו לי את הדוח המלא
        </button>
      </div>
      <button
        type="button"
        className="bubble-input-send"
        onClick={() => picked && item.onSubmit(picked === 'with-meeting')}
        disabled={!picked}
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
      >
        שליחה
      </button>
    </>
  );
}

const selectedStyle: React.CSSProperties = {
  outline: '3px solid rgba(0, 153, 255, 0.30)',
  outlineOffset: '2px',
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_PROMPT = {
  singular: 'מה כתובת המייל שלך?',
  plural: 'מה כתובת המייל שלכם?',
};

const NAME_PROMPT = {
  singular: 'מה שמך המלא?',
  plural: 'מה שמכם המלא?',
};

const PHONE_PROMPT = {
  singular: 'מה מספר הנייד?',
  plural: 'מה מספר הנייד?',
};

function findQuestion(qid: string): Q2Question {
  if (qid === 'Q12_FA') return Q12_FA;
  if (qid === 'Q12_FB') return Q12_FB;
  const q = Q2_QUESTIONS.find((x) => x.id === qid);
  if (!q) throw new Error(`Question ${qid} not found`);
  return q;
}

function isEmailValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isNameValid(s: string): boolean {
  return s.trim().length >= 2;
}

function isPhoneValid(s: string): boolean {
  const d = s.replace(/\D/g, '');
  return /^(0\d{8,9}|972\d{8,9})$/.test(d);
}
