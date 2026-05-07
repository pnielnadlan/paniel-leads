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

import { useEffect, useState } from 'react';
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
      {state.screen === 'success' && <SuccessScreen wantsMeeting={state.wantsMeeting} />}

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
        <div className="q-actions-spacer" />
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
  return (
    <div className="screen screen-form">
      <div className="form-eyebrow">זה מוכן!</div>
      <h2 className="form-title">מה המייל שלך?</h2>
      <p className="form-help">
        הדוח המלא יישלח אליך במייל, וגם — מיד נשתף כאן 5 כותרות-תובנות משמעותיות מתוך הדוח המלא.
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
      <h2 className="insights-title">מעולה {fullName},</h2>
      <p className="insights-intro">
        הדוח המפורט שלנו יישלח אליך בדקות הקרובות, ובנתיים — הנה 5 "כותרות" מתוך הדוח:
      </p>
      <ul className="teasers-list">
        {teasers.map((t, i) => (
          <li key={i} className="teaser-item">
            <span className="teaser-bullet">›</span>
            <span className="teaser-text">{t}</span>
          </li>
        ))}
      </ul>
      <p className="insights-cta-text">
        <strong>התובנות שקיבלת עכשיו הן רק ההתחלה.</strong> בפגישת אפיון נוכל לבדוק יחד איך הנתונים, ההון והמטרות שלכם מתחברים לעסקה אמיתית — בלי לנחש, בלי להמר, ובלי להיכנס למהלך שלא מתאים לכם.
      </p>
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

function SuccessScreen({ wantsMeeting }: { wantsMeeting: boolean }) {
  return (
    <div className="screen screen-success">
      <div className="success-icon" aria-hidden="true">✓</div>
      <h2 className="success-title">מעולה, שלחנו את הדוח המלא במייל</h2>
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

