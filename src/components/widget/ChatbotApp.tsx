'use client';

// V2 (q2) — שאלון פניאל בסגנון צ'אטבוט.
// State machine מבוסס "step": לכל מצב יש תוכן לשליחה (בועות בוט) ופעולה הבאה
// (אופציות לבחירה, שדה טקסט, או auto-advance). הצ'אט מתעדכן בסקרול אוטומטי.

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

/** סוג בועה בטרנסקריפט. */
type Bubble =
  | { kind: 'hero' }
  | { kind: 'bot'; text: string; key: string }
  | { kind: 'user'; text: string; key: string }
  | { kind: 'loading'; text: string; key: string }
  | { kind: 'result'; eyebrow: string; title: string; text: string; key: string };

/** מצב הזרימה. */
type Phase =
  | 'intro' // הוצגו בועות הפתיחה, ממתין ל-Get started
  | 'audience' // שאלת זוג/יחיד
  | { kind: 'question'; qid: string } // שאלה רגילה
  | 'soft_framing' // מסך טקסט ריכוך לפני Q12_FB
  | { kind: 'question_followup'; qid: 'Q12_FA' | 'Q12_FB' }
  | 'ending_message' // הודעת סיום (פעיל/רך) לפני איסוף פרטים
  | 'collect_email'
  | 'collect_name'
  | 'collect_phone'
  | 'submitting'
  | 'finished';

export function ChatbotApp() {
  const [transcript, setTranscript] = useState<Bubble[]>([{ kind: 'hero' }]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [audience, setAudience] = useState<AudienceVariant | null>(null);
  const [answers, setAnswers] = useState<Q2Answers>(new Map());
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-scroll לתחתית בכל עדכון — אבל לא ברנדר הראשון, כדי שהמשתמש יראה
  // את תמונת הצוות + בועות הפתיחה מההתחלה ולא יקבל מסך גלול לתחתית.
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hasInteractedRef = useRef(false);
  useEffect(() => {
    if (!hasInteractedRef.current) return;
    const el = transcriptRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [transcript, phase]);

  const markInteracted = () => {
    hasInteractedRef.current = true;
  };

  // ─── Append helpers ───────────────────────────────────────────────────────
  const append = (bubble: Bubble) => setTranscript((t) => [...t, bubble]);

  const appendBot = (text: string) => {
    const key = `bot-${Date.now()}-${Math.random()}`;
    append({ kind: 'bot', text, key });
  };

  const appendUser = (text: string) => {
    const key = `user-${Date.now()}-${Math.random()}`;
    append({ kind: 'user', text, key });
  };

  // ─── זרימה: בועות פתיחה ─────────────────────────────────────────────────
  // ב-mount: שלח את כל בועות הפתיחה. הראשונה כבר ב-transcript (hero), עכשיו
  // נוסיף את ההודעות. במקום delays — הכל ביחד, מהיר ונקי.
  const introInitialized = useRef(false);
  useEffect(() => {
    if (introInitialized.current) return;
    introInitialized.current = true;
    setTranscript([
      { kind: 'hero' },
      ...INTRO_BUBBLES.map((text, i) => ({ kind: 'bot' as const, text, key: `intro-${i}` })),
    ]);
  }, []);

  // ─── handler: התחלת השאלון ─────────────────────────────────────────────
  const handleStart = () => {
    markInteracted();
    appendUser(START_BUTTON_LABEL);
    appendBot(AUDIENCE_QUESTION.text);
    setPhase('audience');
  };

  // ─── handler: בחירת זוג/יחיד ───────────────────────────────────────────
  const handleAudience = (oid: 'A' | 'B') => {
    const opt = AUDIENCE_QUESTION.options.find((o) => o.id === oid)!;
    appendUser(opt.text);
    setAudience(opt.variant);
    askQuestion('Q1', opt.variant);
  };

  // ─── helper: שאלה רגילה ─────────────────────────────────────────────────
  const askQuestion = (qid: string, aud: AudienceVariant) => {
    const q = findQuestion(qid);
    appendBot(pickVariant(q.text, aud));
    setPhase({ kind: 'question', qid });
  };

  // ─── handler: בחירת תשובה לשאלה רגילה ──────────────────────────────────
  const handleAnswer = (qid: string, oid: OptionId) => {
    if (!audience) return;
    const q = findQuestion(qid);
    const opt = q.options.find((o) => o.id === oid);
    if (!opt) return;

    appendUser(pickVariant(opt.text, audience));
    const newAnswers = new Map(answers);
    newAnswers.set(qid, oid);
    setAnswers(newAnswers);

    advanceFlow(qid, oid, newAnswers);
  };

  // ─── זרימה: התקדמות אחרי תשובה ──────────────────────────────────────────
  const advanceFlow = (currentQid: string, currentOid: OptionId, ans: Q2Answers) => {
    if (!audience) return;

    // שאלות 1-11 עוברות בלינארית
    const linearOrder = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11'];
    const idx = linearOrder.indexOf(currentQid);
    if (idx >= 0 && idx < linearOrder.length - 1) {
      const next = linearOrder[idx + 1];
      askQuestion(next, audience);
      return;
    }
    if (currentQid === 'Q11') {
      askQuestion('Q12', audience);
      return;
    }

    // Q12 — סניף לפי תשובה
    if (currentQid === 'Q12') {
      if (currentOid === 'A') {
        // Q12=A → שאלת המשך Q12_FA
        appendBot(pickVariant(Q12_FA.text, audience));
        setPhase({ kind: 'question_followup', qid: 'Q12_FA' });
      } else {
        // Q12=B → מסלול ריכוך + Q12_FB
        showSoftFraming(ans);
      }
      return;
    }

    // Q12_FA — סניף לפי תשובה
    if (currentQid === 'Q12_FA') {
      if (currentOid === 'C') {
        // Q12_FA=C → מעבר למסלול הריכוך
        showSoftFraming(ans);
      } else {
        // A/B → המשך ל-Q13
        askQuestion('Q13', audience);
      }
      return;
    }

    // Q12_FB — סניף לפי תשובה
    if (currentQid === 'Q12_FB') {
      if (currentOid === 'C') {
        // Q12_FB=C → סיום רך, דילוג על Q13
        finishConversation(ans, false);
      } else {
        askQuestion('Q13', audience);
      }
      return;
    }

    // Q13 — סוף השאלות
    if (currentQid === 'Q13') {
      const isActive = currentOid === 'A' || currentOid === 'B';
      finishConversation(ans, isActive);
      return;
    }
  };

  // ─── זרימה: מסך הריכוך + Q12_FB ─────────────────────────────────────────
  const showSoftFraming = (ans: Q2Answers) => {
    if (!audience) return;
    appendBot(pickVariant(SOFT_FRAMING_INTRO, audience));
    // הזנב נבחר לפי Q9 motivation
    const q9opt = ans.get('Q9');
    const q9 = Q2_QUESTIONS.find((q) => q.id === 'Q9')!;
    const motivation =
      (q9opt && q9.options.find((o) => o.id === q9opt)?.motivation) ?? 'smarter_money';
    appendBot(pickVariant(SOFT_FRAMING_TAIL_BY_MOTIVATION[motivation as Motivation], audience));
    appendBot(pickVariant(Q12_FB.text, audience));
    setPhase({ kind: 'question_followup', qid: 'Q12_FB' });
  };

  // ─── זרימה: סיום שאלות, מעבר לאיסוף פרטים ──────────────────────────────
  // 'active' קובע איזה טקסט סיום מציגים ("מעולה" vs "תודה שעניתם"),
  // אבל לא משפיע על Smoove או על רידיירקטים — ב-V2 כולם מקבלים אותו טיפול.
  const finishConversation = (_ans: Q2Answers, active: boolean) => {
    if (!audience) return;
    appendBot(pickVariant(active ? ENDING_ACTIVE : ENDING_SOFT, audience));
    appendBot(pickVariant(EMAIL_PROMPT, audience));
    setPhase('collect_email');
  };

  // ─── handlers: איסוף פרטים ─────────────────────────────────────────────
  const handleEmailSubmit = () => {
    if (!isEmailValid(email) || !audience) return;
    appendUser(email);
    appendBot(pickVariant(NAME_PROMPT, audience));
    setPhase('collect_name');
  };

  const handleNameSubmit = () => {
    if (!isNameValid(fullName) || !audience) return;
    appendUser(fullName.trim());
    appendBot(pickVariant(PHONE_PROMPT, audience));
    setPhase('collect_phone');
  };

  const handlePhoneSubmit = async () => {
    if (!isPhoneValid(phone) || !audience) return;
    appendUser(phone);
    setPhase('submitting');
    setSubmitError(null);
    append({
      kind: 'loading',
      text: 'מנתחים את התשובות שלכם ומפיקים את הדוח האישי…',
      key: `loading-${Date.now()}`,
    });

    // Score client-side לתצוגה מיידית (ה-server עושה ניקוד בנפרד)
    const result = scoreQ2Submission(answers);

    try {
      const payload = {
        questionnaireId: 'q2',
        audience,
        answers: Object.fromEntries(answers),
        email,
        fullName: fullName.trim(),
        phone,
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

      // הסר את בועת הטעינה והוסף את התוצאה — וסיים שם.
      // אין רידיירקט, אין בועת "הצלחה" — הטקסט "תודה שהשארתם פרטים..." כבר נאמר.
      setTranscript((t) => t.filter((b) => b.kind !== 'loading'));

      const reportContent = Q2_REPORTS[result.selectedReport];
      append({
        kind: 'result',
        eyebrow: 'הניתוח שלכם מוכן',
        title: Q2_REPORT_NAMES[result.selectedReport],
        text: reportContent.simulatorOutput,
        key: `result-${Date.now()}`,
      });
      setPhase('finished');
    } catch (err) {
      setTranscript((t) => t.filter((b) => b.kind !== 'loading'));
      setSubmitError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
      setPhase('collect_phone'); // אפשר לנסות שוב
    }
  };

  // ─── רינדור ה-input area לפי phase ─────────────────────────────────────
  function renderInputArea() {
    if (phase === 'intro') {
      return (
        <button className="cta-btn" onClick={handleStart}>
          {START_BUTTON_LABEL}
        </button>
      );
    }
    if (phase === 'audience') {
      return (
        <div className="option-buttons">
          {AUDIENCE_QUESTION.options.map((opt) => (
            <button
              key={opt.id}
              className="option-btn"
              onClick={() => handleAudience(opt.id)}
            >
              <span className="option-btn-marker">{HEBREW_LETTER[opt.id]}</span>
              <span>{opt.text}</span>
            </button>
          ))}
        </div>
      );
    }
    if (typeof phase === 'object' && phase.kind === 'question') {
      const q = findQuestion(phase.qid);
      return (
        <div className="option-buttons">
          {q.options.map((opt) => (
            <button
              key={opt.id}
              className="option-btn"
              onClick={() => handleAnswer(q.id, opt.id)}
            >
              <span className="option-btn-marker">{HEBREW_LETTER[opt.id]}</span>
              <span>{audience ? pickVariant(opt.text, audience) : ''}</span>
            </button>
          ))}
        </div>
      );
    }
    if (typeof phase === 'object' && phase.kind === 'question_followup') {
      const q = phase.qid === 'Q12_FA' ? Q12_FA : Q12_FB;
      return (
        <div className="option-buttons">
          {q.options.map((opt) => (
            <button
              key={opt.id}
              className="option-btn"
              onClick={() => handleAnswer(q.id, opt.id)}
            >
              <span className="option-btn-marker">{HEBREW_LETTER[opt.id]}</span>
              <span>{audience ? pickVariant(opt.text, audience) : ''}</span>
            </button>
          ))}
        </div>
      );
    }
    if (phase === 'collect_email') {
      const ok = isEmailValid(email);
      return (
        <>
          <div className="chat-input-wrap">
            <input
              type="email"
              dir="ltr"
              className="chat-input"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ok && handleEmailSubmit()}
              autoFocus
            />
            <button
              className="chat-input-send"
              onClick={handleEmailSubmit}
              disabled={!ok}
              aria-label="שלח"
            >
              ←
            </button>
          </div>
          {submitError && <div className="chat-error">{submitError}</div>}
        </>
      );
    }
    if (phase === 'collect_name') {
      const ok = isNameValid(fullName);
      return (
        <div className="chat-input-wrap">
          <input
            type="text"
            className="chat-input"
            placeholder="שם מלא"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ok && handleNameSubmit()}
            autoFocus
          />
          <button
            className="chat-input-send"
            onClick={handleNameSubmit}
            disabled={!ok}
            aria-label="שלח"
          >
            ←
          </button>
        </div>
      );
    }
    if (phase === 'collect_phone') {
      const ok = isPhoneValid(phone);
      return (
        <>
          <div className="chat-input-wrap">
            <input
              type="tel"
              dir="ltr"
              inputMode="tel"
              className="chat-input"
              placeholder="050-1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ok && handlePhoneSubmit()}
              autoFocus
            />
            <button
              className="chat-input-send"
              onClick={handlePhoneSubmit}
              disabled={!ok}
              aria-label="שלח"
            >
              ←
            </button>
          </div>
          {submitError && <div className="chat-error">{submitError}</div>}
        </>
      );
    }
    return null;
  }

  return (
    <div className="chatbot-root">
      <div className="chat-brandbar">
        <span className="chat-brandbar-name">פניאל נדל״ן · סימולטור משקיע</span>
      </div>
      <div className="chat-transcript" ref={transcriptRef}>
        {transcript.map((b) => {
          if (b.kind === 'hero') {
            return (
              <div key="hero" className="chat-hero">
                <img src="/q2/hero.jpg" alt="צוות פניאל נדל״ן" />
              </div>
            );
          }
          if (b.kind === 'bot') {
            return (
              <div key={b.key} className="bubble-bot">
                {b.text}
              </div>
            );
          }
          if (b.kind === 'user') {
            return (
              <div key={b.key} className="bubble-user">
                {b.text}
              </div>
            );
          }
          if (b.kind === 'loading') {
            return (
              <div key={b.key} className="bubble-loading">
                <div className="bubble-loading-spinner" />
                <span className="bubble-loading-text">{b.text}</span>
              </div>
            );
          }
          if (b.kind === 'result') {
            return (
              <div key={b.key} className="bubble-result">
                <div className="bubble-result-eyebrow">{b.eyebrow}</div>
                <h3 className="bubble-result-title">{b.title}</h3>
                <div>{b.text}</div>
              </div>
            );
          }
          return null;
        })}
      </div>
      {phase !== 'submitting' && phase !== 'finished' && (
        <div className="chat-input-area">{renderInputArea()}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const HEBREW_LETTER: Record<OptionId, string> = {
  A: 'א',
  B: 'ב',
  C: 'ג',
  D: 'ד',
  E: 'ה',
};

const EMAIL_PROMPT = {
  singular: 'כדי שנשלח אליך את הדוח המלא — מה כתובת המייל שלך?',
  plural: 'כדי שנשלח אליכם את הדוח המלא — מה כתובת המייל שלכם?',
};

const NAME_PROMPT = {
  singular: 'מה שמך המלא?',
  plural: 'מה שמכם המלא?',
};

const PHONE_PROMPT = {
  singular: 'ומה מספר הנייד שלך? (כדי שנוכל לחזור אליך)',
  plural: 'ומה מספר הנייד שלכם? (כדי שנוכל לחזור אליכם)',
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
