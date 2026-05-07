'use client';

// QuestionnaireApp — שאלון פניאל נדל"ן.
// מנהל state machine שעובר בין מסכים: intro → questions → loading → email → name → insights → success.
// כל מסכים מוצגים באותו container (iframe-friendly), עם אנימציות מעבר עדינות.
//
// מהדרישות של הלקוח:
//   - גדלים: 900×500 default, רספונסיבי לוויידג'ט
//   - padding פנימי משמעותי כדי שטקסט לא ייחתך
//   - RTL בעברית
//   - כפתור "הבא" מפורש לכל שאלה — לא מתקדם אוטומטית
//   - תשובה נבחרת מודגשת ויזואלית עד הלחיצה על "הבא"
//   - צבעי המותג: Prussian Blue, Baltic Blue, Strong Cyan, Dodger Blue

import { useEffect, useRef, useState } from 'react';
import {
  QUESTIONS,
  type OptionId,
  type Question,
  type Option,
} from '@/data/questions';
import { scoreSubmission, type Answers } from '@/lib/scoring';
import { TEASERS_BY_REPORT } from '@/data/teasers';

type Screen =
  | 'intro'
  | 'question'
  | 'loading'
  | 'email'
  | 'name'
  | 'insights'
  | 'success';

type AppState = {
  screen: Screen;
  answers: Map<number, OptionId>;
  currentQid: number;
  pendingSelection: OptionId | null;
  email: string;
  fullName: string;
  wantsMeeting: boolean;
  wantsReport: boolean;
  // נחושב לאחר השאלון, לפני מסך התובנות:
  reportId: string | null;
  teasers: string[];
  // מצב submit לקריאה ל-API:
  submitting: boolean;
  submitError: string | null;
};

// אם המשתמש סימן "רוצים פגישה" — מעבירים אותו לעמוד תודה במלוא הדף.
// העמוד נמצא על pnielnadlan.co.il (דומיין אחר), לכן window.top.location
// (cross-origin top navigation מותרת ב-write).
const MEETING_THANKYOU_URL = 'https://pnielnadlan.co.il/t/';

const INITIAL_STATE: AppState = {
  screen: 'intro',
  answers: new Map(),
  currentQid: 1,
  pendingSelection: null,
  email: '',
  fullName: '',
  wantsMeeting: false,
  wantsReport: false,
  reportId: null,
  teasers: [],
  submitting: false,
  submitError: null,
};

const TOTAL_QUESTIONS_FOR_PROGRESS = 13;

function nextQid(currentId: number, answers: Map<number, OptionId>): number | null {
  if (currentId >= 1 && currentId < 7) return currentId + 1;
  if (currentId === 7) {
    const a = answers.get(7);
    if (a === 'A') return 80;
    if (a === 'B') return 81;
    if (a === 'C') return 82;
    if (a === 'D') return 83;
    return null;
  }
  if (currentId >= 80 && currentId <= 83) return 9;
  if (currentId >= 9 && currentId < 13) return currentId + 1;
  return null;
}

function displayQNumber(qid: number): number {
  if (qid >= 80 && qid <= 83) return 8;
  return qid;
}

function findQuestion(qid: number): Question {
  const q = QUESTIONS.find((q) => q.id === qid);
  if (!q) throw new Error(`Question ${qid} not found`);
  return q;
}

export function QuestionnaireApp() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);

  return (
    <div className="widget-root">
      {state.screen === 'intro' && <IntroScreen onStart={() => setState({ ...state, screen: 'question', currentQid: 1, pendingSelection: null })} />}
      {state.screen === 'question' && (
        <QuestionScreen
          question={findQuestion(state.currentQid)}
          selected={state.pendingSelection ?? state.answers.get(state.currentQid) ?? null}
          progress={displayQNumber(state.currentQid)}
          conditionalSubtitle={
            // ב-Q8 (id 80-83) הצג את הכותרת שנבחרה ב-Q7 כתזכורת
            state.currentQid >= 80 && state.currentQid <= 83
              ? findQuestion(7).options.find((o) => o.id === state.answers.get(7))?.text
              : undefined
          }
          onSelect={(oid) => setState({ ...state, pendingSelection: oid })}
          onNext={() => {
            if (!state.pendingSelection) return;
            const newAnswers = new Map(state.answers);
            newAnswers.set(state.currentQid, state.pendingSelection);
            const next = nextQid(state.currentQid, newAnswers);
            if (next === null) {
              setState({ ...state, answers: newAnswers, pendingSelection: null, screen: 'loading' });
            } else {
              setState({
                ...state,
                answers: newAnswers,
                currentQid: next,
                pendingSelection: newAnswers.get(next) ?? null,
              });
            }
          }}
          onBack={
            state.currentQid > 1
              ? () => {
                  // חזרה אחורה — מצא את ה-qid הקודם בסדר ה-flow
                  const prev = previousQid(state.currentQid, state.answers);
                  if (prev === null) return;
                  setState({
                    ...state,
                    currentQid: prev,
                    pendingSelection: state.answers.get(prev) ?? null,
                  });
                }
              : undefined
          }
        />
      )}
      {state.screen === 'loading' && (
        <LoadingScreen onDone={() => setState({ ...state, screen: 'email' })} />
      )}
      {state.screen === 'email' && (
        <EmailScreen
          value={state.email}
          onChange={(email) => setState({ ...state, email })}
          onNext={() => setState({ ...state, screen: 'name' })}
        />
      )}
      {state.screen === 'name' && (
        <NameScreen
          value={state.fullName}
          onChange={(fullName) => setState({ ...state, fullName })}
          onNext={() => {
            // ניקוד client-side + שליפת תובנות מקובץ הנתונים שנבנה ב-build time
            const result = scoreSubmission(state.answers);
            const teaserData = TEASERS_BY_REPORT[result.reportId];
            setState({
              ...state,
              screen: 'insights',
              reportId: result.reportId,
              teasers: teaserData?.teasers ?? [],
            });
          }}
        />
      )}
      {state.screen === 'insights' && (
        <InsightsScreen
          fullName={state.fullName}
          teasers={state.teasers}
          wantsMeeting={state.wantsMeeting}
          wantsReport={state.wantsReport}
          submitting={state.submitting}
          submitError={state.submitError}
          onToggleMeeting={(v) => setState({ ...state, wantsMeeting: v })}
          onToggleReport={(v) => setState({ ...state, wantsReport: v })}
          onSubmit={async () => {
            setState({ ...state, submitting: true, submitError: null });
            try {
              const payload = {
                answers: Object.fromEntries(state.answers),
                email: state.email,
                fullName: state.fullName,
                wantsMeeting: state.wantsMeeting,
                wantsReport: state.wantsReport,
              };
              const res = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (!res.ok) {
                const errBody = await res.json().catch(() => ({ error: 'שגיאה לא צפויה' }));
                throw new Error(errBody.error || 'השליחה נכשלה');
              }
              // אם המשתמש מבקש פגישה — מעבירים את כל הדף לעמוד תודה.
              // אחרת — מציגים success screen מקומית כרגיל.
              if (state.wantsMeeting) {
                try {
                  if (window.top) {
                    window.top.location.href = MEETING_THANKYOU_URL;
                  } else {
                    window.location.href = MEETING_THANKYOU_URL;
                  }
                } catch {
                  // אם הדפדפן חוסם cross-origin top navigation — fallback לתוך האייפריים
                  window.location.href = MEETING_THANKYOU_URL;
                }
                return;
              }
              setState((s) => ({ ...s, submitting: false, screen: 'success' }));
            } catch (err) {
              setState((s) => ({
                ...s,
                submitting: false,
                submitError: err instanceof Error ? err.message : 'שגיאה לא צפויה',
              }));
            }
          }}
        />
      )}
      {state.screen === 'success' && (
        <SuccessScreen wantsMeeting={state.wantsMeeting} email={state.email} />
      )}

      {state.screen === 'question' && (
        <ProgressBar current={displayQNumber(state.currentQid)} total={TOTAL_QUESTIONS_FOR_PROGRESS} />
      )}
    </div>
  );
}

function previousQid(currentId: number, answers: Map<number, OptionId>): number | null {
  if (currentId === 1) return null;
  if (currentId >= 2 && currentId <= 7) return currentId - 1;
  if (currentId >= 80 && currentId <= 83) return 7;
  if (currentId === 9) {
    const a = answers.get(7);
    if (a === 'A') return 80;
    if (a === 'B') return 81;
    if (a === 'C') return 82;
    if (a === 'D') return 83;
    return 7;
  }
  if (currentId >= 10 && currentId <= 13) return currentId - 1;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen screen-intro">
      <div className="intro-eyebrow">פניאל נדל"ן · אבחון פרופיל משקיע</div>
      <h1 className="intro-title">תוך 20 שניות תדע<br />את פרופיל המשקיע שלך</h1>
      <p className="intro-text">
        אנחנו שואלים שאלות מבוססות ידע כללי, תענו כמה שיותר אינטואיטיבית בשליפה — זה יהיה יותר אפקטיבי.
        <br />
        מוכנים?
      </p>
      <button className="btn-primary btn-lg" onClick={onStart}>
        קדימה
        <span className="btn-arrow">‹</span>
      </button>
    </div>
  );
}

function QuestionScreen({
  question,
  selected,
  progress,
  onSelect,
  onNext,
  onBack,
  conditionalSubtitle,
}: {
  question: Question;
  selected: OptionId | null;
  progress: number;
  onSelect: (oid: OptionId) => void;
  onNext: () => void;
  onBack?: () => void;
  conditionalSubtitle?: string;
}) {
  const optionCount = question.options.length;
  const layoutClass = optionCount === 2 ? 'options-grid-2' : 'options-stack';

  return (
    <div className="screen screen-question" key={question.id}>
      <div className="q-counter">שאלה {progress} מתוך 13</div>
      {/* מבוא רך נפרד היררכית מהשאלה (לדוגמה ש' 13) */}
      {question.intro && <p className="q-intro">{question.intro}</p>}
      <h2 className="q-text">{question.text}</h2>
      {conditionalSubtitle && (
        <div className="q-subtitle">("{conditionalSubtitle}")</div>
      )}
      <div className={`options ${layoutClass}`}>
        {question.options.map((opt) => (
          <OptionButton
            key={opt.id}
            option={opt}
            isSelected={selected === opt.id}
            onClick={() => onSelect(opt.id)}
          />
        ))}
      </div>
      <div className="q-actions">
        {onBack && (
          <button className="btn-ghost" onClick={onBack}>
            <span className="btn-arrow flip">‹</span>
            חזרה
          </button>
        )}
        <button className="btn-primary" onClick={onNext} disabled={!selected}>
          הבא
          <span className="btn-arrow">‹</span>
        </button>
      </div>
    </div>
  );
}

// מיפוי A-E לאותיות עבריות לתצוגה. ה-id הפנימי נשאר A-E לתאימות עם מנוע הניקוד.
const HEBREW_MARKER: Record<OptionId, string> = {
  A: 'א',
  B: 'ב',
  C: 'ג',
  D: 'ד',
  E: 'ה',
};

function OptionButton({
  option,
  isSelected,
  onClick,
}: {
  option: Option;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`option ${isSelected ? 'option-selected' : ''}`}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      <span className="option-marker">{HEBREW_MARKER[option.id]}</span>
      <span className="option-text">{option.text}</span>
    </button>
  );
}

function LoadingScreen({ onDone }: { onDone: () => void }) {
  const messages = [
    'מעולה. אנחנו על זה…',
    'מנתחים את התשובות שלך…',
    'מפיקים לך דוח פרופיל משקיע…',
  ];
  const [progress, setProgress] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const totalDuration = 5000; // 5 שניות
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalDuration) * 100);
      setProgress(pct);
      const newMsgIdx = Math.min(messages.length - 1, Math.floor((elapsed / totalDuration) * messages.length));
      setMsgIdx(newMsgIdx);
      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(onDone, 500);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [onDone, messages.length]);

  return (
    <div className="screen screen-loading">
      <div className="loading-spinner" aria-hidden="true">
        <div className="loading-spinner-circle" />
      </div>
      <h2 className="loading-message">{messages[msgIdx]}</h2>
      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function EmailScreen({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  // קונפטי חוגג שמופיע פעם אחת כשהמסך הזה נטען (אחרי שסיימת לענות על השאלון)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { default: confetti } = await import('canvas-confetti');
        if (cancelled) return;
        // אקדח קונפטי משני צדדים
        const fire = (originX: number) =>
          confetti({
            particleCount: 70,
            spread: 80,
            startVelocity: 45,
            angle: originX < 0.5 ? 60 : 120,
            origin: { x: originX, y: 0.6 },
            colors: ['#00cccc', '#0099ff', '#7dd3fc', '#ffffff'],
            zIndex: 9999,
            scalar: 0.9,
          });
        fire(0.2);
        fire(0.8);
        setTimeout(() => {
          if (!cancelled) {
            fire(0.35);
            fire(0.65);
          }
        }, 250);
      } catch {
        // אם הקונפטי נכשל בטעינה — לא שובר את המסך
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="screen screen-form">
      <div className="form-eyebrow">🎉 זה מוכן!</div>
      <h2 className="form-title">מה המייל שלך?</h2>
      <p className="form-help">
        הדוח המלא יישלח אליך במייל, וגם — <strong>מיד נשתף כאן</strong> 5 כותרות-תובנות משמעותיות מתוך הדוח המלא.
      </p>
      <input
        type="email"
        dir="ltr"
        className="form-input"
        placeholder="name@example.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isValid) onNext();
        }}
        autoFocus
      />
      <button className="btn-primary" onClick={onNext} disabled={!isValid}>
        הבא
        <span className="btn-arrow">‹</span>
      </button>
    </div>
  );
}

function NameScreen({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const isValid = value.trim().length >= 2;
  return (
    <div className="screen screen-form">
      <h2 className="form-title">ומה השם המלא?</h2>
      <input
        type="text"
        className="form-input"
        placeholder="ישראל ישראלי"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isValid) onNext();
        }}
        autoFocus
      />
      <button className="btn-primary" onClick={onNext} disabled={!isValid}>
        הבא
        <span className="btn-arrow">‹</span>
      </button>
    </div>
  );
}

function InsightsScreen({
  fullName,
  teasers,
  wantsMeeting,
  wantsReport,
  submitting,
  submitError,
  onToggleMeeting,
  onToggleReport,
  onSubmit,
}: {
  fullName: string;
  teasers: string[];
  wantsMeeting: boolean;
  wantsReport: boolean;
  submitting: boolean;
  submitError: string | null;
  onToggleMeeting: (v: boolean) => void;
  onToggleReport: (v: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="screen screen-insights">
      {/* הפסיק נשאר מחוץ לספאן הצבעוני */}
      <h2 className="insights-title">
        מעולה <span className="insights-name">{fullName}</span>,
      </h2>
      <p className="insights-intro">
        הדוח המפורט שלנו יישלח אליך בדקות הקרובות, ובנתיים — הנה 5 "כותרות" מתוך הדוח:
      </p>

      <TeaserCarousel teasers={teasers} />

      <div className="insights-cta">
        <h3 className="insights-cta-title">אבל התובנות האלו הן רק ההתחלה...</h3>
        <p className="insights-cta-body">
          רוצים באמת להשקיע בעתיד שלכם כמו שצריך? בואו לשבת איתנו לפגישת אפיון מקיפה ונוכל לבדוק יחד איך הנתונים, ההון והמטרות שלכם מתחברים לתוכנית אסטרטגית ארוכת טווח להגדלת ההון שלכם.
        </p>
      </div>

      <div className="checkboxes">
        <CheckboxRow
          label="אשמח שתחזרו אלי לצורך קביעת פגישה"
          checked={wantsMeeting}
          onChange={onToggleMeeting}
        />
        <CheckboxRow
          label="שלחו לי את הדוח המלא למייל"
          checked={wantsReport}
          onChange={onToggleReport}
        />
      </div>
      <button
        className="btn-primary btn-lg"
        onClick={onSubmit}
        disabled={(!wantsMeeting && !wantsReport) || submitting}
      >
        {submitting ? 'שולח...' : 'שליחה'}
      </button>
      {submitError && (
        <p className="submit-error">{submitError}</p>
      )}
    </div>
  );
}

/**
 * קרוסלה של 5 תובנות עם אפקט "ערימה":
 * - הכרטיסיה הפעילה במרכז
 * - כרטיסיות שכבר ראינו נערמות מאחורי הפעילה (הזחה רק 8px ימינה+למטה)
 * - הכרטיסיה הבאה מציצה משמאל (כיוון "הבא" ב-RTL)
 * - דקות-ניווט: חיצים + נקודות, לחיצה על נקודה קופצת ישירות
 */
function TeaserCarousel({ teasers }: { teasers: string[] }) {
  const [active, setActive] = useState(0);
  const total = teasers.length;
  const goPrev = () => setActive((i) => Math.max(0, i - 1));
  const goNext = () => setActive((i) => Math.min(total - 1, i + 1));

  return (
    <div className="teaser-carousel">
      <div className="teaser-stage">
        {teasers.map((t, i) => {
          const offset = i - active;
          let pos: string;
          if (offset === 0) pos = 'active';
          else if (offset < 0) {
            // כבר ראינו — נערמת מאחורי הפעילה
            const depth = Math.min(Math.abs(offset), 4);
            pos = `behind-${depth}`;
          } else if (offset === 1) {
            pos = 'next';
          } else {
            pos = 'hidden-left';
          }
          return (
            <div
              key={i}
              className="teaser-card"
              data-pos={pos}
              onClick={() => offset !== 0 && setActive(i)}
              role="button"
              tabIndex={offset === 0 ? -1 : 0}
            >
              <div className="teaser-card-num">תובנה {i + 1} מתוך {total}</div>
              <p className="teaser-card-text">{t}</p>
            </div>
          );
        })}
      </div>
      <div className="teaser-nav">
        {/* חיצים מותאמים ל-RTL: prev = ימינה, next = שמאלה */}
        <button
          className="teaser-arrow"
          onClick={goPrev}
          disabled={active === 0}
          aria-label="הקודם"
        >
          ›
        </button>
        <div className="teaser-dots">
          {teasers.map((_, i) => (
            <button
              key={i}
              className={`teaser-dot ${i === active ? 'teaser-dot-active' : ''}`}
              onClick={() => setActive(i)}
              aria-label={`תובנה ${i + 1}`}
            />
          ))}
        </div>
        <button
          className="teaser-arrow"
          onClick={goNext}
          disabled={active === total - 1}
          aria-label="הבא"
        >
          ‹
        </button>
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`checkbox-row ${checked ? 'checkbox-checked' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="checkbox-input"
      />
      <span className="checkbox-box" aria-hidden="true">
        {checked && '✓'}
      </span>
      <span className="checkbox-label">{label}</span>
    </label>
  );
}

function SuccessScreen({
  wantsMeeting,
  email,
}: {
  wantsMeeting: boolean;
  email: string;
}) {
  return (
    <div className="screen screen-success">
      <div className="success-icon" aria-hidden="true">✓</div>
      <h2 className="success-title">הדוח המלא בדרך אליך</h2>
      <p className="success-text">
        נשלח עכשיו לכתובת:
      </p>
      <div className="success-email">{email}</div>
      <p className="success-text">
        {wantsMeeting
          ? 'בקרוב נחזור אליך לתיאום פגישת אפיון אישית.'
          : 'נהיה בקשר.'}
      </p>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = (current / total) * 100;
  return (
    <div className="top-progress">
      <div className="top-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

