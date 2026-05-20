'use client';

// V2 (q2) — צ'אטבוט.
// אווטאר אחד יחיד (floating) שזז ברצף בתוך אזור השיחה — נצמד לראש הודעת
// הבוט האחרונה. במעבר בין הודעות בוט-ל-בוט (ברצף) הוא מחליק חלק; בהופעה
// "טרייה" (אחרי הודעת משתמש) הוא מופיע במקום בלי גלישה.
// בועות גדולות "מציירות" קונטור באלכסון; קצרות מופיעות בנעימות.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Q2_QUESTIONS,
  AUDIENCE_QUESTION,
  INTRO_BUBBLES,
  START_BUTTON_LABEL,
  WAIT_MOMENT_TEXT,
  SIMULATOR_INTRO_PREFIX,
  MEETING_LEAD_IN,
  REASSURE_HESITANT,
  MEETING_CLOSING,
  TESTIMONIAL_IMAGES,
  TESTIMONIALS_INTRO_MEETING,
  TESTIMONIALS_INTRO_REPORT,
  DIY_VS_PRO_MESSAGE,
  POTENTIAL_MEETING_PROMPT,
  HESITANT_CHOICE_OPTIONS,
  REPORT_BEING_SENT,
  LAST_CHANCE_PROMPT,
  LAST_CHANCE_OPTIONS,
  GOODBYE_REPORT_ONLY,
  pickVariant,
  type AudienceVariant,
  type OptionId,
  type Q2Question,
} from '@/data/questions-q2';
import { Q2_REPORTS } from '@/data/reports-q2';
import { scoreQ2Submission, type Q2Answers } from '@/lib/scoring-q2';
import { trackLead } from '@/components/FacebookPixel';

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
  | { kind: 'typing'; key: string }
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
const AVATAR_SIZE = 38; // חייב להיות תואם ל-CSS var --avatar-size

function isBotSide(kind: Item['kind']): boolean {
  return (
    kind === 'bot' ||
    kind === 'hero' ||
    kind === 'loading' ||
    kind === 'typing' ||
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
  // משמר את תשובת Q12 (א/ב) להמשך החלטות בזרימה אחרי הסימולטור.
  const q12AnswerRef = useRef<'A' | 'B' | null>(null);
  const submittedRef = useRef(false);

  // ─── אווטאר floating ─────────────────────────────────────────────────────
  // - top: כתובת ה-resting (= bubble.bottom - avatarSize/2). השינוי שלו מפעיל
  //   CSS transition (continuation בין בועות).
  // - לבורסט חדש: pendingDescent נשמר ב-ref; כשהאווטאר עושה mount דרך ה-ref
  //   callback, אנחנו מפעילים WAAPI animate() ישירות על ה-element. זה מבטיח
  //   שהאנימציה מוצמדת לעוד לפני ה-paint הראשון, בלי תלות ב-rAF/state-loop.
  const [avatarTop, setAvatarTop] = useState<number | null>(null);
  const [avatarBurstId, setAvatarBurstId] = useState(0);
  const [avatarTransitionMs, setAvatarTransitionMs] = useState(850);
  const pendingDescentRef = useRef<{ height: number; durationMs: number } | null>(null);

  // ─── גלילה ─────────────────────────────────────────────────────────────
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

  // postMessage לאתר ההורה בכל הוספת בועה — מאפשר לאתר ההורה לגלול את ה-iframe
  // לתוך הצפייה (כדי שמשתמש שמטמיע אותנו ב-Elementor יראה תמיד את הקצה התחתון
  // של השיחה ולא יצטרך לגלול ידנית).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'paniel-q2-update' }, '*');
      } catch {
        // cross-origin postMessage failed — לא נורא, פשוט לא תגלוש האתר ההורה
      }
    }
  }, [items]);

  // ─── חישוב מיקום האווטאר אחרי כל שינוי items ──────────────────────────
  useLayoutEffect(() => {
    const t = transcriptRef.current;
    if (!t) return;
    let lastBotIdx = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (isBotSide(items[i].kind)) {
        lastBotIdx = i;
        break;
      }
    }
    if (lastBotIdx === -1) {
      setAvatarTop(null);
      return;
    }
    const child = t.children[lastBotIdx] as HTMLElement | undefined;
    if (!child) return;

    const bubbleHeight = child.offsetHeight;
    const bubbleBottom = child.offsetTop + bubbleHeight;
    const restingTop = bubbleBottom - AVATAR_SIZE / 2;
    const isContinuation = lastBotIdx > 0 && isBotSide(items[lastBotIdx - 1].kind);

    // ─── זמן אנימציה לפי סוג הבועה ──────────────────────────────────────
    // - בועות נמוכות (≤100px) — סטטי לחלוטין, האווטאר קופץ למקום בלי תנועה.
    // - testimonials — אנימציה ארוכה יותר (התמונות נכנסות עם stagger ארוך).
    // - שאר הבועות הארוכות — 850ms (תואם את ציור הריבוע).
    const lastItem = items[lastBotIdx];
    let durationMs: number;
    if (bubbleHeight <= 100) {
      durationMs = 0;
    } else if (lastItem.kind === 'testimonials') {
      durationMs = 1800;
    } else {
      durationMs = 850;
    }

    setAvatarTransitionMs(durationMs);
    setAvatarTop(restingTop);

    if (!isContinuation && bubbleHeight > 100) {
      // בורסט חדש על בועה גבוהה — descent דרך WAAPI.
      pendingDescentRef.current = { height: bubbleHeight, durationMs };
      setAvatarBurstId((k) => k + 1);
    } else if (!isContinuation) {
      // בורסט חדש על בועה קצרה — רק bump key (כדי שלא יזחול), בלי descent.
      setAvatarBurstId((k) => k + 1);
    }
  }, [items]);

  // ref callback — מפעיל WAAPI descent ברגע שה-element מאתחל ב-DOM.
  const avatarRefCallback = (el: HTMLDivElement | null) => {
    if (!el) return;
    const pending = pendingDescentRef.current;
    if (pending === null || pending.height <= 0) return;
    pendingDescentRef.current = null;
    el.animate(
      [
        { transform: `translateY(${-pending.height}px)`, opacity: 0, offset: 0 },
        { transform: `translateY(${-pending.height * 0.85}px)`, opacity: 1, offset: 0.18 },
        { transform: 'translateY(0)', opacity: 1, offset: 1 },
      ],
      { duration: pending.durationMs, easing: 'linear', fill: 'both' },
    );
  };

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

    // תזמון: כל בועה מופיעה בסיום הציור של הקודמת (~850ms = --anim-long)
    // כך שהאווטאר נע ברצף חלק, בלי פערים.
    // Stage 0: hero מיד
    setItems([{ kind: 'hero', key: 'hero' }]);
    // Stage 1: intro long ב-t=850
    const t1 = setTimeout(
      () => append({ kind: 'bot', text: longIntro, key: 'intro-long', length: 'long' }),
      850,
    );
    // Stage 2: "שנתחיל?" ב-t=1700
    const t2 = setTimeout(
      () => append({ kind: 'bot', text: startQ, key: 'intro-start-q', length: 'short' }),
      1700,
    );
    // Stage 3: "בואו נתחיל" ב-t=2400 (קצר יותר אחרי "שנתחיל?")
    const t3 = setTimeout(
      () =>
        append({
          kind: 'start',
          key: 'start-btn',
          label: START_BUTTON_LABEL,
          onPick: () => handleStart(),
        }),
      2400,
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

    // Q11/Q13/Q12_FA/Q12_FB הוסרו. הזרימה: Q1→…→Q10→Q12→איסוף פרטים→סימולטור.
    const linearOrder = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10'];
    const idx = linearOrder.indexOf(currentQid);
    if (idx >= 0 && idx < linearOrder.length - 1) {
      askQuestion(linearOrder[idx + 1], aud);
      return;
    }
    if (currentQid === 'Q10') {
      askQuestion('Q12', aud);
      return;
    }

    if (currentQid === 'Q12') {
      // שתי התשובות (א/ב) ממשיכות לאותה זרימה — איסוף פרטים. שומרים את התשובה
      // עבור הענף שאחרי הסימולטור.
      q12AnswerRef.current = currentOid as 'A' | 'B';
      // הודעת מבוא רכה לפני בקשת השם — שונה לפי תשובת Q12:
      // - א ("מבין/ה שזה מה שנצרך") → "איזה יופי! מיד נציע לך משהו מעניין..."
      // - ב ("מלחיץ אותי אם אני במקום הנכון") → "זה בסדר, כבר נגיע לזה..."
      const leadIn = currentOid === 'A' ? MEETING_LEAD_IN : REASSURE_HESITANT;
      appendBot(pickVariant(leadIn, aud));
      // delay קצר ואז ממשיכים לאיסוף הפרטים, כך שהמשתמש יראה את ההודעה לפני
      // שמופיעה השאלה.
      setTimeout(() => collectDetailsThenSimulate(), 600);
      return;
    }
  };

  /** איסוף שם → מייל → טלפון. אחר כך trackLead ואז סימולטור. */
  const collectDetailsThenSimulate = () => {
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
          // השלמת פרטים = ליד. ירייה ל-Facebook Pixel דרך postMessage להורה.
          trackLead();
          void showSimulatorAndBranch();
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

  /**
   * רצף הסימולטור החדש:
   *   1) "רק רגע" (בועה קצרה)
   *   2) אנימציית "מקליד" (3 נקודות) למשך 2 שניות
   *   3) בועה: "הנה דבר הסימולטור אליכם:"
   *   4) בועת התוצאה (כותרת + תוכן)
   *   5) ענף לפי תשובת Q12:
   *      - Q12=א → MEETING_CLOSING + מבוא לעדויות (מסלול פגישה) + תמונות + submit(true)
   *      - Q12=ב → DIY_VS_PRO + POTENTIAL_MEETING_PROMPT + HESITANT_CHOICE_OPTIONS
   */
  const showSimulatorAndBranch = async () => {
    const aud = audienceRef.current;
    if (!aud) return;

    // 1) "רק רגע"
    appendBot(pickVariant(WAIT_MOMENT_TEXT, aud));
    await delay(450);

    // 2) typing indicator
    const typingKey = `typing-${Date.now()}`;
    append({ kind: 'typing', key: typingKey });
    await delay(2000);
    setItems((arr) => arr.filter((it) => it.key !== typingKey));

    // 3) בועה: "הנה דבר הסימולטור אליכם:"
    appendBot(pickVariant(SIMULATOR_INTRO_PREFIX, aud));
    await delay(400);

    // 4) בועת תוצאה (ניקוד client-side)
    const result = scoreQ2Submission(answersRef.current);
    const reportContent = Q2_REPORTS[result.selectedReport];
    append({
      kind: 'result',
      key: `result-${Date.now()}`,
      eyebrow: 'הניתוח שלכם מוכן',
      title: reportContent.pdfReport.title,
      text: reportContent.simulatorOutput,
    });
    await delay(1500);

    // 5) ענף לפי Q12
    if (q12AnswerRef.current === 'A') {
      await runMeetingPath();
    } else {
      await runHesitantPath();
    }
  };

  /** מסלול Q12=א: תודה + מבוא לעדויות + תמונות. submit(true). */
  const runMeetingPath = async () => {
    const aud = audienceRef.current;
    if (!aud) return;
    appendBot(pickVariant(MEETING_CLOSING, aud));
    await delay(900);
    appendBot(pickVariant(TESTIMONIALS_INTRO_MEETING, aud));
    await delay(700);
    if (TESTIMONIAL_IMAGES.length > 0) {
      append({ kind: 'testimonials', key: `tst-${Date.now()}`, images: TESTIMONIAL_IMAGES });
    }
    void submitToServer(true);
  };

  /** מסלול Q12=ב: DIY vs Pro + הצעה לפגישה + 2 אופציות. */
  const runHesitantPath = async () => {
    const aud = audienceRef.current;
    if (!aud) return;
    appendBot(pickVariant(DIY_VS_PRO_MESSAGE, aud));
    await delay(1200);
    appendBot(pickVariant(POTENTIAL_MEETING_PROMPT, aud));
    await delay(400);
    const key = `hesitant-${Date.now()}`;
    append({
      kind: 'options',
      key,
      options: [
        { id: 'with-meeting', text: pickVariant(HESITANT_CHOICE_OPTIONS.withMeeting, aud) },
        { id: 'report-only', text: pickVariant(HESITANT_CHOICE_OPTIONS.reportOnly, aud) },
      ],
      onPick: (id) => {
        const isMeeting = id === 'with-meeting';
        const text = isMeeting
          ? pickVariant(HESITANT_CHOICE_OPTIONS.withMeeting, aud)
          : pickVariant(HESITANT_CHOICE_OPTIONS.reportOnly, aud);
        resolveItem(key, text);
        if (isMeeting) {
          void runMeetingPath();
        } else {
          void runReportOnlyPath();
        }
      },
    });
  };

  /** מסלול "רק דוח" של HESITANT: הודעת "הדוח מופק" + מבוא תמונות + תמונות
   *  + הצעה אחרונה (LAST_CHANCE). */
  const runReportOnlyPath = async () => {
    const aud = audienceRef.current;
    if (!aud) return;
    const reportMsg = pickVariant(REPORT_BEING_SENT, aud).replace('[[email]]', emailRef.current);
    appendBot(reportMsg);
    await delay(1100);
    appendBot(pickVariant(TESTIMONIALS_INTRO_REPORT, aud));
    await delay(600);
    if (TESTIMONIAL_IMAGES.length > 0) {
      append({ kind: 'testimonials', key: `tst-${Date.now()}`, images: TESTIMONIAL_IMAGES });
    }
    await delay(1500);
    appendBot(pickVariant(LAST_CHANCE_PROMPT, aud));
    await delay(400);
    const key = `last-chance-${Date.now()}`;
    append({
      kind: 'options',
      key,
      options: [
        { id: 'with-meeting', text: pickVariant(LAST_CHANCE_OPTIONS.withMeeting, aud) },
        { id: 'report-only', text: pickVariant(LAST_CHANCE_OPTIONS.reportOnly, aud) },
      ],
      onPick: (id) => {
        const isMeeting = id === 'with-meeting';
        const text = isMeeting
          ? pickVariant(LAST_CHANCE_OPTIONS.withMeeting, aud)
          : pickVariant(LAST_CHANCE_OPTIONS.reportOnly, aud);
        resolveItem(key, text);
        if (isMeeting) {
          // המשתמש שינה את דעתו ברגע האחרון — שולחים את הודעת התודה ו-submit
          // ל-Smoove עם wantsMeeting=true.
          appendBot(pickVariant(MEETING_CLOSING, aud));
          void submitToServer(true);
        } else {
          // פרידה סופית, submit עם wantsMeeting=false.
          appendBot(pickVariant(GOODBYE_REPORT_ONLY, aud));
          void submitToServer(false);
        }
      },
    });
  };

  /** שליחה לשרת — מייצרת PDF, מעלה ל-Supabase, מסנכרנת ל-Smoove.
   *  אין רידיירקט: אירוע Facebook Lead כבר ירה ברגע איסוף הפרטים (טלפון).
   *  המשתמש נשאר בצ'אט וקורא את הודעת הסיום בקצב שלו.
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
      <div className="chat-transcript" ref={transcriptRef}>
        {items.map((it) => renderItem(it))}
        {avatarTop !== null && (
          <div
            key={`avatar-${avatarBurstId}`}
            ref={avatarRefCallback}
            className="floating-avatar"
            style={{
              top: `${avatarTop}px`,
              transition: `top ${avatarTransitionMs}ms linear`,
            }}
            aria-hidden="true"
          >
            <span className="bot-avatar-letter">פ</span>
          </div>
        )}
        <div ref={bottomSentinelRef} aria-hidden="true" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderItem(it: Item) {
  switch (it.kind) {
    case 'hero':
      return (
        <div key={it.key} className="bot-row">
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
          <div className="bubble-loading">
            <span className="bubble-loading-spinner" aria-hidden="true" />
            <span>{it.text}</span>
          </div>
        </div>
      );
    case 'typing':
      return (
        <div key={it.key} className="bot-row">
          <div className="bubble-typing" aria-label="פניאל מקליד">
            <span className="bubble-typing-dot" />
            <span className="bubble-typing-dot" />
            <span className="bubble-typing-dot" />
          </div>
        </div>
      );
    case 'result':
      return (
        <div key={it.key} className="bot-row">
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
