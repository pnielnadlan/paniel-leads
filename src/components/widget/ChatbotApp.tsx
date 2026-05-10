'use client';

// V2 (q2) — צ'אטבוט.
// אווטאר רק על הודעת הבוט האחרונה ברצף.
// בועות גדולות "מציירות" קונטור באלכסון; בועות קצרות מופיעות בנעימות.
// הופעה הדרגתית של בועות הפתיחה + smooth scroll על כל בועה חדשה.

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
  FINAL_CHOICE_PROMPT,
  FINAL_CHOICE_OPTIONS,
  NEXT_STEP_PROMPT,
  MEETING_CLOSING,
  REENGAGEMENT_PROMPT,
  REENGAGEMENT_OPTIONS,
  REPORT_ONLY_CLOSING,
  ANALYZING_TEXT,
  TESTIMONIAL_IMAGES,
  TESTIMONIALS_INTRO,
  pickVariant,
  type AudienceVariant,
  type OptionId,
  type Q2Question,
  type Motivation,
} from '@/data/questions-q2';
import { Q2_REPORTS } from '@/data/reports-q2';
import { scoreQ2Submission, type Q2Answers } from '@/lib/scoring-q2';

type BotLength = 'long' | 'short';

type Item =
  | { kind: 'hero'; key: string }
  | { kind: 'bot'; text: string; key: string; length: BotLength }
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
  | { kind: 'loading'; text: string; key: string }
  | {
      kind: 'result';
      key: string;
      eyebrow: string;
      title: string;
      text: string;
    }
  | { kind: 'testimonials'; key: string; images: string[] }
  | { kind: 'error'; text: string; key: string };

const LONG_THRESHOLD = 140;

function isBotSide(kind: Item['kind']): boolean {
  return (
    kind === 'bot' ||
    kind === 'hero' ||
    kind === 'loading' ||
    kind === 'result' ||
    kind === 'testimonials'
  );
}

export function ChatbotApp() {
  const [items, setItems] = useState<Item[]>([]);
  const [, setAudience] = useState<AudienceVariant | null>(null);
  const answersRef = useRef<Q2Answers>(new Map());
  const audienceRef = useRef<AudienceVariant | null>(null);
  const emailRef = useRef('');
  const fullNameRef = useRef('');
  const phoneRef = useRef('');
  const initialChoiceRef = useRef<'with-meeting' | 'report-only' | null>(null);
  const submittedRef = useRef(false);

  // ─── גלילה: smooth scroll לתחתית על כל פריט חדש; משתמש יכול לגלול למעלה
  // ידנית (אנחנו מאפשרים לו, רק שולחים אותו חזרה לתחתית כשהוא קרוב לתחתית).
  const transcriptRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const lastUserScrollAtRef = useRef(0);

  const scrollToBottom = (smooth = false) => {
    const el = transcriptRef.current;
    if (!el) return;
    if (smooth) {
      bottomSentinelRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight + 9999;
    }
  };

  useEffect(() => {
    // אם המשתמש גלל ידנית ב-2.5 שניות האחרונות — לא נילחם בו.
    const sinceUser = Date.now() - lastUserScrollAtRef.current;
    if (sinceUser < 2500) return;
    // גלילה מיידית פעמיים, ואז עוד פעמיים בעיכוב לתפוס תמונות שעולות מאוחר
    requestAnimationFrame(() => scrollToBottom(false));
    const ts = [80, 350, 900, 1600, 2400].map((d) =>
      setTimeout(() => scrollToBottom(false), d),
    );
    return () => ts.forEach(clearTimeout);
  }, [items]);

  // עקיבה אחרי גלילה ידנית
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const onWheel = () => {
      lastUserScrollAtRef.current = Date.now();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', onWheel, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onWheel);
    };
  }, []);

  // ─── append helpers ────────────────────────────────────────────────────
  const append = (item: Item) => setItems((arr) => [...arr, item]);

  const appendBot = (text: string) => {
    const key = `bot-${Date.now()}-${Math.random()}`;
    const length: BotLength = text.length > LONG_THRESHOLD ? 'long' : 'short';
    append({ kind: 'bot', text, key, length });
  };

  const resolveItem = (key: string, userText: string) => {
    setItems((arr) =>
      arr.map((it) =>
        it.key === key ? ({ kind: 'user', text: userText, key: it.key } as Item) : it,
      ),
    );
  };

  // ─── הופעה הדרגתית של בועות הפתיחה ─────────────────────────────────────
  const introInitialized = useRef(false);
  useEffect(() => {
    if (introInitialized.current) return;
    introInitialized.current = true;
    const longIntro = INTRO_BUBBLES.slice(0, 5).join('\n\n');
    const startQ = INTRO_BUBBLES[5];

    // Stage 0: hero מיד עם הטעינה
    setItems([{ kind: 'hero', key: 'hero' }]);
    // Stage 1: intro long (אחרי 700ms)
    const t1 = setTimeout(
      () => append({ kind: 'bot', text: longIntro, key: 'intro-long', length: 'long' }),
      700,
    );
    // Stage 2: "שנתחיל?" (אחרי 2400ms)
    const t2 = setTimeout(
      () => append({ kind: 'bot', text: startQ, key: 'intro-start-q', length: 'short' }),
      2400,
    );
    // Stage 3: כפתור "בואו נתחיל" (אחרי 2900ms)
    const t3 = setTimeout(
      () =>
        append({
          kind: 'start',
          key: 'start-btn',
          label: START_BUTTON_LABEL,
          onPick: () => handleStart(),
        }),
      2900,
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── handlers ───────────────────────────────────────────────────────────
  const handleStart = () => {
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
      // לפי המשתמש: Q12_FB=C כבר לא מדלג ישר על Q13 — נכנס למסלול הסיום הרך
      // עם הצעה פרטנית לפני איסוף פרטים.
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

  /** אחרי כל מסלול שאלות → מציגים טקסט סיום ואז 2-אופציות (פגישה / רק דוח). */
  const finishConversation = (active: boolean) => {
    const aud = audienceRef.current;
    if (!aud) return;
    appendBot(pickVariant(active ? ENDING_ACTIVE : ENDING_SOFT, aud));
    appendBot(pickVariant(FINAL_CHOICE_PROMPT, aud));
    appendInitialChoice();
  };

  const appendInitialChoice = () => {
    const aud = audienceRef.current;
    if (!aud) return;
    const key = `final-${Date.now()}`;
    append({
      kind: 'options',
      key,
      options: [
        { id: 'with-meeting', text: pickVariant(FINAL_CHOICE_OPTIONS.withMeeting, aud) },
        { id: 'report-only', text: pickVariant(FINAL_CHOICE_OPTIONS.reportOnly, aud) },
      ],
      onPick: (id) => {
        initialChoiceRef.current = id as 'with-meeting' | 'report-only';
        const text =
          id === 'with-meeting'
            ? pickVariant(FINAL_CHOICE_OPTIONS.withMeeting, aud)
            : pickVariant(FINAL_CHOICE_OPTIONS.reportOnly, aud);
        resolveItem(key, text);
        if (id === 'with-meeting') {
          // מסלול "פגישה" — איסוף פרטים מלא לפני הסימולטור
          collectDetailsThenContinue();
        } else {
          // מסלול "רק דוח" — דילוג על הטופס; ישר לסימולטור + תמונות + הצעה-מחדש
          void showSimulatorAndContinue();
        }
      },
    });
  };

  const collectDetailsThenContinue = () => {
    const aud = audienceRef.current;
    if (!aud) return;
    appendBot(pickVariant(NAME_PROMPT, aud));
    appendInput('text', 'שם מלא', isNameValid, (name) => {
      fullNameRef.current = name.trim();
      appendBot(pickVariant(EMAIL_PROMPT, aud));
      appendInput('email', 'name@example.com', isEmailValid, (em) => {
        emailRef.current = em;
        appendBot(pickVariant(PHONE_PROMPT, aud));
        appendInput('tel', '050-1234567', isPhoneValid, (ph) => {
          phoneRef.current = ph;
          void showSimulatorAndContinue();
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

  /** מציג בועת "מנתחים..." → תוצאה → תמונות → ענף לפי הבחירה הראשונית. */
  const showSimulatorAndContinue = async () => {
    const aud = audienceRef.current;
    if (!aud) return;

    // Stage A: בועת analyzing (על המסך כ-1.5 שנייה)
    const loadingKey = `loading-${Date.now()}`;
    append({
      kind: 'loading',
      key: loadingKey,
      text: pickVariant(ANALYZING_TEXT, aud),
    });
    await delay(1500);

    // Stage B: ניקוד client-side + הצגת תוצאה
    const result = scoreQ2Submission(answersRef.current);
    const reportContent = Q2_REPORTS[result.selectedReport];
    setItems((arr) => arr.filter((it) => it.key !== loadingKey));
    append({
      kind: 'result',
      key: `result-${Date.now()}`,
      eyebrow: 'הניתוח שלכם מוכן',
      title: reportContent.pdfReport.title, // הכותרת ההסברית המלאה (לא "בשלות גבוהה לפגישה")
      text: reportContent.simulatorOutput,
    });

    // Stage C: הודעת מבוא לתמונות + תמונות עדויות
    await delay(1100);
    if (TESTIMONIAL_IMAGES.length > 0) {
      appendBot(pickVariant(TESTIMONIALS_INTRO, aud));
      await delay(900);
      append({ kind: 'testimonials', key: `tst-${Date.now()}`, images: TESTIMONIAL_IMAGES });
    }

    // Stage D: ענף לפי הבחירה הראשונית
    await delay(1100);
    if (initialChoiceRef.current === 'with-meeting') {
      // מסלול "פגישה": NEXT_STEP_PROMPT + MEETING_CLOSING + שליחה לשרת (פרטים כבר נאספו)
      appendBot(pickVariant(NEXT_STEP_PROMPT, aud));
      await delay(700);
      appendBot(pickVariant(MEETING_CLOSING, aud));
      void submitToServer(true);
    } else {
      // מסלול "רק דוח": REENGAGEMENT_PROMPT + 2 אופציות (פרטים לא נאספו עדיין)
      appendBot(pickVariant(REENGAGEMENT_PROMPT, aud));
      await delay(400);
      appendReengagementOptions();
    }
  };

  const appendReengagementOptions = () => {
    const aud = audienceRef.current;
    if (!aud) return;
    const key = `reengage-${Date.now()}`;
    append({
      kind: 'options',
      key,
      options: [
        { id: 'with-meeting', text: pickVariant(REENGAGEMENT_OPTIONS.withMeeting, aud) },
        { id: 'report-only', text: pickVariant(REENGAGEMENT_OPTIONS.reportOnly, aud) },
      ],
      onPick: (id) => {
        const isMeeting = id === 'with-meeting';
        const text = isMeeting
          ? pickVariant(REENGAGEMENT_OPTIONS.withMeeting, aud)
          : pickVariant(REENGAGEMENT_OPTIONS.reportOnly, aud);
        resolveItem(key, text);
        if (isMeeting) {
          // המשתמש שינה את דעתו — נדרש לאסוף פרטים עכשיו לפני שליחת PDF + Smoove
          appendBot(pickVariant(NAME_PROMPT, aud));
          appendInput('text', 'שם מלא', isNameValid, (name) => {
            fullNameRef.current = name.trim();
            appendBot(pickVariant(EMAIL_PROMPT, aud));
            appendInput('email', 'name@example.com', isEmailValid, (em) => {
              emailRef.current = em;
              appendBot(pickVariant(PHONE_PROMPT, aud));
              appendInput('tel', '050-1234567', isPhoneValid, (ph) => {
                phoneRef.current = ph;
                appendBot(pickVariant(MEETING_CLOSING, aud));
                void submitToServer(true);
              });
            });
          });
        } else {
          // נשאר במסלול "רק דוח" — סיום עם הפניה לאתר, ללא submit לשרת
          // (אין PDF / Smoove כי המשתמש לא אישר ולא נתן פרטים).
          appendBot(pickVariant(REPORT_ONLY_CLOSING, aud));
        }
      },
    });
  };

  /** שליחה לשרת ברקע — מייצרת PDF, מעלה ל-Supabase, מסנכרנת ל-Smoove.
   *  אי-הצלחה לא משבשת את חוויית המשתמש (כבר קיבל את התוצאה ב-UI).
   */
  const submitToServer = async (wantsMeeting: boolean) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const aud = audienceRef.current;
    if (!aud) return;
    try {
      await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionnaireId: 'q2',
          audience: aud,
          answers: Object.fromEntries(answersRef.current),
          email: emailRef.current,
          fullName: fullNameRef.current,
          phone: phoneRef.current,
          wantsMeeting,
        }),
      });
    } catch (err) {
      console.error('[chatbot] background submit failed:', err);
    }
  };

  return (
    <div className="chatbot-root">
      <div className="chat-brandbar">
        <span className="chat-brandbar-name">פניאל נדל״ן · סימולטור משקיע</span>
      </div>
      <div className="chat-transcript" ref={transcriptRef}>
        {items.map((it, i) => {
          const next = items[i + 1];
          const showAvatar = !next || !isBotSide(next.kind);
          return renderItem(it, showAvatar);
        })}
        <div ref={bottomSentinelRef} aria-hidden="true" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────────

function BotAvatar() {
  return (
    <div className="bot-avatar" aria-hidden="true">
      <span className="bot-avatar-letter">פ</span>
    </div>
  );
}

function AvatarSpacer() {
  return <div className="bot-avatar-spacer" aria-hidden="true" />;
}

function renderItem(it: Item, showAvatar: boolean) {
  switch (it.kind) {
    case 'hero':
      return (
        <div key={it.key} className="bot-row">
          {showAvatar ? <BotAvatar /> : <AvatarSpacer />}
          <div className="bubble-bot-wrap bubble-hero">
            <div className="bubble-bot-frame" />
            <div className="bubble-bot-content">
              <img src="/q2/hero.jpg" alt="צוות פניאל נדל״ן" width={1500} height={1000} />
            </div>
          </div>
        </div>
      );
    case 'bot':
      return (
        <div key={it.key} className="bot-row">
          {showAvatar ? <BotAvatar /> : <AvatarSpacer />}
          <div className={`bubble-bot-wrap bubble-${it.length}`}>
            <div className="bubble-bot-frame" />
            <div className="bubble-bot-content">
              <BotText text={it.text} />
            </div>
          </div>
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
          <span className="start-bubble-dot" aria-label="לחיצה נדרשת" />
        </div>
      );
    case 'input':
      return <InputBubble key={it.key} item={it} />;
    case 'loading':
      return (
        <div key={it.key} className="bot-row">
          {showAvatar ? <BotAvatar /> : <AvatarSpacer />}
          <div className="bubble-loading">
            <span className="bubble-loading-spinner" aria-hidden="true" />
            <span>{it.text}</span>
          </div>
        </div>
      );
    case 'result':
      return (
        <div key={it.key} className="bot-row">
          {showAvatar ? <BotAvatar /> : <AvatarSpacer />}
          <div className="bubble-result-wrap">
            <div className="bubble-result-frame" />
            <div className="bubble-result-content">
              <div className="bubble-result-eyebrow">{it.eyebrow}</div>
              <h3 className="bubble-result-title">{it.title}</h3>
              <div className="bubble-result-body">{it.text}</div>
            </div>
          </div>
        </div>
      );
    case 'testimonials':
      return (
        <div key={it.key} className="bot-row bot-row-testimonials">
          {showAvatar ? <BotAvatar /> : <AvatarSpacer />}
          <div className="testimonials-grid">
            {it.images.map((src, i) => (
              <div key={src} className={`testimonial-card testimonial-card-${i + 1}`}>
                <img src={src} alt={`עדות לקוח ${i + 1}`} />
              </div>
            ))}
          </div>
        </div>
      );
    case 'error':
      return (
        <div key={it.key} className="chat-error">
          {it.text}
        </div>
      );
    default:
      return null;
  }
}

/** טקסט בוט עם תמיכה ב-**bold** וקישורי URL אוטומטיים. */
function BotText({ text }: { text: string }) {
  return <>{parseInline(text)}</>;
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // regex משולב: **bold** או URL
  const re = /(\*\*[^*]+?\*\*)|(https?:\/\/[^\s]+)/g;
  let m: RegExpExecArray | null;
  let lastIdx = 0;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(<span key={key++}>{text.slice(lastIdx, m.index)}</span>);
    }
    if (m[1]) {
      parts.push(<strong key={key++}>{m[1].slice(2, -2)}</strong>);
    } else if (m[2]) {
      parts.push(
        <a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[2]}
        </a>,
      );
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIdx)}</span>);
  }
  return parts;
}

function InputBubble({ item }: { item: Extract<Item, { kind: 'input' }> }) {
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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
