// קונפיגורציית השאלון — פניאל נדל"ן
// 13 שאלות, כאשר ש' 8 מותנית בתשובת ש' 7 (4 וריאציות).
// ש' 1-12 משפיעות על ניקוד פרופיל המשקיע (פרט לש' 3).
// ש' 13 קובעת את פוקוס הדוח (report_focus).

export type ProfileId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type CapitalRange =
  | 'up_to_150k'
  | '150k_300k'
  | '300k_500k'
  | '500k_1m'
  | '1m_plus';

export type InvestmentGoal = 'first_property' | 'growth_from_existing_property';

export type ReportFocus = 1 | 2 | 3 | 4 | 5;

export type OptionId = 'A' | 'B' | 'C' | 'D' | 'E';

export type Option = {
  id: OptionId;
  text: string;
  scores?: Partial<Record<ProfileId, number>>;
  capitalRange?: CapitalRange;
  investmentGoal?: InvestmentGoal;
  hasExistingProperty?: boolean;
  selectedHeadline?: string;
  q8Variant?: 'A' | 'B' | 'C' | 'D';
  reportFocus?: ReportFocus;
  /** אייקון אופציונלי במקום אות. שימוש כיום: שאלה 13 (פוקוס הדוח). */
  icon?: string;
};

export type Question = {
  id: number;
  displayId: string;
  /** טקסט מבוא רך אופציונלי שמופיע מעל השאלה עצמה ומופרד היררכית. */
  intro?: string;
  text: string;
  options: Option[];
  conditional?: { onQuestionId: number; whenAnswerId: OptionId };
};

export const QUESTIONS: Question[] = [
  {
    id: 1,
    displayId: '1',
    text: 'נתחיל בבסיס. יש לכם סכום כסף בצד. מה רץ לכם בראש?',
    options: [
      // 4 אופציות במקום 5 — הוסרה אופציית "אני צריך מישהו שיעזור לי" (P5)
      // ש-P5 מקבל ניקוד מספיק משאלות אחרות (Q4B, Q5B, Q6C, Q10A/D, Q12D וכו')
      { id: 'A', text: '"זה הגב הכלכלי שלנו, מפחיד לסכן אותו"', scores: { P1: 1 } },
      { id: 'B', text: '"חבל שהוא סתם עומד, אבל אני לא רוצה לעשות שטויות"', scores: { P2: 1 } },
      { id: 'C', text: '"אני מרגיש שיש כאן פוטנציאל, רק חסרה לי דרך ברורה"', scores: { P3: 1 } },
      { id: 'D', text: '"אני רוצה שהוא יעבוד, אבל בלי להכניס את הבית ללחץ"', scores: { P4: 1 } },
    ],
  },
  {
    id: 2,
    displayId: '2',
    text: 'מה הפחד שלכם בעסקת נדל"ן?',
    options: [
      // 4 אופציות — הוסרה "לגלות בדיעבד שכולם ראו משהו שפספסתי" שהיא דומה
      // לאופציית A ("ליפול על עסקה מצ'וקמקת"). שתיהן מתמפות ל-P2.
      { id: 'A', text: 'ליפול על עסקה מצ\'וקמקת בלי רווח', scores: { P2: 1 } },
      { id: 'B', text: 'להתחייב להחזר של משכנתא או הלוואה', scores: { P1: 1 } },
      { id: 'C', text: 'להיתקע עם נכס דפוק', scores: { P4: 1 } },
      { id: 'D', text: 'דווקא לא לפעול - ואז להצטער בעוד כמה שנים', scores: { P5: 1 } },
    ],
  },
  {
    id: 3,
    displayId: '3',
    text: 'כמה הון עצמי זמין יש לכם להשקעה?',
    options: [
      { id: 'A', text: 'עד 150 אלף ש"ח', capitalRange: 'up_to_150k' },
      { id: 'B', text: '150-300 אלף ש"ח', capitalRange: '150k_300k' },
      { id: 'C', text: '300-500 אלף ש"ח', capitalRange: '300k_500k' },
      { id: 'D', text: '500 אלף - מיליון ש"ח', capitalRange: '500k_1m' },
      { id: 'E', text: 'מיליון ש"ח ומעלה', capitalRange: '1m_plus' },
    ],
  },
  {
    id: 4,
    displayId: '4',
    text: 'מה היעדים שלכם?',
    options: [
      {
        id: 'A',
        text: 'להגיע לנכס ראשון',
        scores: { P1: 1 },
        investmentGoal: 'first_property',
        hasExistingProperty: false,
      },
      {
        id: 'B',
        text: 'יש כבר נכס, רוצים להתקדם כלכלית למקום גבוה יותר',
        scores: { P5: 1 },
        investmentGoal: 'growth_from_existing_property',
        hasExistingProperty: true,
      },
    ],
  },
  {
    id: 5,
    displayId: '5',
    text: 'דירת פריסייל בתנאי 10/90. מה השאלה החשובה?',
    options: [
      { id: 'A', text: 'האם המחיר באמת נמוך ממחיר השוק, ולא רק נשמע כמו "הזדמנות"', scores: { P2: 1 } },
      { id: 'B', text: 'הנחות יש בעוד מקומות. השאלה אם תנאי התשלום, המיסוי והמימון יוצרים יתרון על עסקה רגילה', scores: { P5: 1 } },
      { id: 'C', text: 'מה קורה אם מכירת הדירה הקיימת מתעכבת?', scores: { P4: 1 } },
      { id: 'D', text: 'האם אני קונה כמו רוכש בודד, או כחלק מקבוצה עם כוח מול היזם?', scores: { P3: 1 } },
    ],
  },
  {
    id: 6,
    displayId: '6',
    text: 'מציעים לכם דירה ישנה במתחם פינוי-בינוי. מה השאלה החשובה?',
    options: [
      // 4 אופציות — הוסרה "אופציית מימוש ויציאה" שהיא וריאציה של אופציה A
      // (שתיהן על "מה קורה לאורך הדרך"). שתיהן מתמפות ל-P4.
      { id: 'A', text: 'מה לוח הזמנים ומה קורה אם הוא מתעכב?', scores: { P4: 1 } },
      { id: 'B', text: 'מי היזם, מי מקדם את הפרויקט?', scores: { P2: 1 } },
      { id: 'C', text: 'מה קורה לערך הנכס בכל שלב בדרך?', scores: { P5: 1 } },
      { id: 'D', text: 'האם המחיר כבר משקף את העליה העתידית וכמה?', scores: { P3: 1 } },
    ],
  },
  {
    id: 7,
    displayId: '7',
    text: 'איזו מבין הכותרות הבאות הכי משפיעה עליכם?',
    options: [
      {
        id: 'A',
        text: 'בנק ישראל הודיע על השארת הריבית הגבוהה',
        scores: { P1: 1 },
        selectedHeadline: 'ריבית_גבוהה',
        q8Variant: 'A',
      },
      {
        id: 'B',
        text: 'נתוני הלמ"ס: המשקיעים חוזרים לשוק הנדל"ן',
        scores: { P3: 1 },
        selectedHeadline: 'משקיעים_חוזרים',
        q8Variant: 'B',
      },
      {
        id: 'C',
        text: 'מנכ"ל משרד השיכון: אל תקנו דירות! חכו לירידת מחירים',
        scores: { P1: 1 },
        selectedHeadline: 'אל_תקנו',
        q8Variant: 'C',
      },
      {
        id: 'D',
        text: 'האמת? אף אחת מהן',
        scores: { P2: 1 },
        selectedHeadline: 'אף_אחת',
        q8Variant: 'D',
      },
    ],
  },
  // ש' 8 מותנית — 4 וריאציות:
  {
    id: 80,
    displayId: '8',
    text: 'ואם זו הכותרת שתפגוש אתכם מחר בבוקר, מה היא תגרום לכם לעשות?',
    conditional: { onQuestionId: 7, whenAnswerId: 'A' },
    options: [
      { id: 'A', text: 'אני נוטה להעדיף זמן נוח יותר, הריבית מרתיעה', scores: { P1: 1 } },
      { id: 'B', text: 'בודק מספרים: אם זה עושה שכל - הריבית לא פקטור', scores: { P2: 1 } },
      { id: 'C', text: 'ריבית גבוהה? מעולה! יש פחות רוכשים ויותר כוח במשא ומתן', scores: { P3: 1 } },
    ],
  },
  {
    id: 81,
    displayId: '8',
    text: 'ואם זו הכותרת שתפגוש אתכם מחר בבוקר, מה היא תגרום לכם לעשות?',
    conditional: { onQuestionId: 7, whenAnswerId: 'B' },
    options: [
      { id: 'A', text: 'משקיעים חוזרים - זה הזמן לצאת', scores: { P1: 1 } },
      { id: 'B', text: 'משקיעים חוזרים - הזמן להיכנס!', scores: { P3: 1 } },
      { id: 'C', text: 'משקיעים תמיד יצאו ונכנסו. מה שקובע זו האסטרטגיה שלי', scores: { P5: 1 } },
    ],
  },
  {
    id: 82,
    displayId: '8',
    text: 'ואם זו הכותרת שתפגוש אתכם מחר בבוקר, מה היא תגרום לכם לעשות?',
    conditional: { onQuestionId: 7, whenAnswerId: 'C' },
    options: [
      { id: 'A', text: 'אולי הוא צודק, כמה המחירים עוד יכולים לעלות? אחשוב פעמיים', scores: { P1: 1 } },
      { id: 'B', text: 'בודק מה הרקע לאמירה ומה הנתונים בפועל', scores: { P2: 1 } },
      { id: 'C', text: 'עם כל הכבוד, פקידי ציבור אינם משקיעי נדל"ן. חולק עליהם', scores: { P3: 1 } },
    ],
  },
  {
    id: 83,
    displayId: '8',
    text: 'אם הכותרות פחות משפיעות עליכם, מה כן יגרום לכם לבדוק עסקת נדל"ן ברצינות?',
    conditional: { onQuestionId: 7, whenAnswerId: 'D' },
    options: [
      { id: 'A', text: 'נתונים ברורים ולא כותרות', scores: { P2: 1 } },
      { id: 'B', text: 'הזדמנות קונקרטית שמתאימה למצב שלי', scores: { P3: 1 } },
      { id: 'C', text: 'ליווי מקצועי שמסביר לי מה באמת קורה בשטח', scores: { P2: 1 } },
    ],
  },
  {
    id: 9,
    displayId: '9',
    text: 'כשאתם בוחנים עסקת נדל"ן, מה יגרום לכם להגיד: "שווה לבדוק את זה לעומק"?',
    options: [
      { id: 'A', text: 'יש היום שווי ברור לנכס, בלי לבנות על "מה שאולי יקרה"', scores: { P1: 1 } },
      { id: 'B', text: 'אם המחיר הנוכחי לא משקף את מה שיכול לקרות בעתיד', scores: { P3: 1 } },
      { id: 'C', text: 'כשיש לנו תוכנית יציאה גם אם הדברים מתעכבים', scores: { P4: 1 } },
      { id: 'D', text: 'המספרים עובדים גם בתרחיש השמרני', scores: { P2: 1 } },
    ],
  },
  {
    id: 10,
    displayId: '10',
    text: 'אומרים את המילה "משכנתא", מה עולה לכם בראש?',
    options: [
      { id: 'A', text: 'משכנתא זה שותף עסקי הכי טוב שאפשר לקבל', scores: { P5: 1 } },
      { id: 'B', text: 'זה טריקי. אם אין תוכנית ברורה זה רק יכביד עלי', scores: { P4: 1 } },
      { id: 'C', text: 'אני לוקח משכנתא רק אם השכירות מכסה את ההחזר', scores: { P4: 1 } },
      { id: 'D', text: 'מה לעשות, בלי מינוף אי אפשר באמת להתקדם בנדל"ן', scores: { P5: 1 } },
    ],
  },
  {
    id: 11,
    displayId: '11',
    text: 'מה יגרום לכם לא לסגור עסקה כלשהי?',
    options: [
      { id: 'A', text: 'יותר מדי דעות מסביב :) כל אחד אומר משהו אחר', scores: { P2: 1 } },
      { id: 'B', text: 'חסרים לי נתונים, יש יותר מדי נעלמים', scores: { P2: 1 } },
      { id: 'C', text: 'אני לא מתחבר לעסקה, יש לי אינטואיציה לא טובה', scores: { P1: 1 } },
      { id: 'D', text: 'הבטחת הרווח תלויה בגורמים חיצוניים ומשתנים', scores: { P4: 1 } },
    ],
  },
  {
    id: 12,
    displayId: '12',
    text: 'מה יותר מרתיע?',
    options: [
      { id: 'A', text: 'להיכנס לעסקה שאני לא מבין', scores: { P2: 1 } },
      { id: 'B', text: 'לפספס הזדמנות בגלל פחד', scores: { P3: 1 } },
      { id: 'C', text: 'להיות תלוי באנשים לא מקצועיים', scores: { P2: 1 } },
      { id: 'D', text: 'להישאר עוד 5 שנים בדיוק באותו מקום כלכלי', scores: { P5: 1 } },
    ],
  },
  {
    id: 13,
    displayId: '13',
    intro: 'הגענו לסוף, למדנו עליכם לא מעט (גם אם לא שמתם לב 🙂) ויש לנו כמה תובנות לחלוק.',
    text: 'בסוף האבחון — מה הכי חשוב לכם לדעת על עצמכם?',
    options: [
      // אייקונים בסגנון line/outline (Lucide-style) במקום אמוג'י
      { id: 'A', text: 'האם אני בכיוון בכלל? האם הכסף שלי עובד נכון?', reportFocus: 1, icon: 'compass' },
      { id: 'B', text: 'האם יש בורות שעלי להיזהר מהן במיוחד? טעויות אני עלול לעשות?', reportFocus: 2, icon: 'alert' },
      { id: 'C', text: 'לקבל כיוון ראשוני לסוג העסקה שמתאימה לי עכשיו', reportFocus: 3, icon: 'target' },
      { id: 'D', text: 'איזה מיומנויות או גישות עלי לשפר כדי להצליח יותר בנדל"ן?', reportFocus: 4, icon: 'trending' },
      { id: 'E', text: 'תהיו כנים: מתאים לי להתעסק בזה בעצמי או שלא כדאי? (ולמה) 🙂', reportFocus: 5, icon: 'help' },
    ],
  },
];

export const PROFILE_NAMES: Record<ProfileId, string> = {
  P1: 'שומרי הביטחון',
  P2: 'מחפשי הבהירות',
  P3: 'מזהי ההזדמנויות',
  P4: 'מתכנני היציאה',
  P5: 'בוני המהלך',
};

export const FOCUS_NAMES: Record<ReportFocus, string> = {
  1: 'בדיקת כיוון כללי - האם הכסף שלכם באמת מתקדם לאנשהו',
  2: 'מפת בורות וסיכונים - איפה אתם עלולים לטעות בלי לשים לב',
  3: 'התאמת סוג עסקה - איזה כיוון השקעה עשוי להתאים לכם כרגע',
  4: 'שדרוג יכולת משקיע - מה כדאי לכם ללמוד, לשפר ולחדד',
  5: 'רמת עצמאות מול ליווי - כמה כדאי לכם להיכנס לבד, וכמה עדיף עם יד מקצועית',
};

export const CAPITAL_RANGE_LABELS: Record<CapitalRange, string> = {
  up_to_150k: 'עד 150 אלף ש"ח',
  '150k_300k': '150-300 אלף ש"ח',
  '300k_500k': '300-500 אלף ש"ח',
  '500k_1m': '500 אלף - מיליון ש"ח',
  '1m_plus': 'מיליון ש"ח ומעלה',
};

// השדה i1 ב-Smoove (dropDownListItem "הסכום הזמין להשקעה") מצפה לאחת מהאפשרויות
// בדיוק כפי שהוגדרו במערכת. ה-options נשלפו מ-/v1/Account/ContactFields.
export const SMOOVE_CAPITAL_LABELS: Record<CapitalRange, string> = {
  up_to_150k: 'עד 150 אלף ₪',
  '150k_300k': '150-300 אלף ₪',
  '300k_500k': '300-500 אלף ₪',
  '500k_1m': '500 אלף - מיליון ₪',
  '1m_plus': 'מיליון ₪ ומעלה',
};
