// Antrenman oynatıcısının durum makinesi.
//
// NEDEN VAR: bu mantık FitAiApp içinde on bir ayrı `useState` ve iç içe
// geçmiş `setTimer(current => { setWorkoutPhase(...); setCurrentSet(...) })`
// çağrılarıyla yazılmıştı. Kural — "set bitince dinlenmeye geç, son sette
// bitir, sayaç kapalıysa geri sayım yok ama seans süresi işlemeye devam
// etsin" — hiçbir yerde tek parça durmuyordu ve test edilemiyordu.
//
// Burası saf: React'i, tarayıcıyı ve katalog tiplerini bilmez. Sıradaki
// hareketler DIŞARIDA durur; buradaki durum yalnızca sıradaki KONUMU ve
// oynatıcı durumunu taşır. Hareketin reçetesi eylemle birlikte geçirilir,
// böylece indirgeyici katalogdan bağımsız kalır.

export type WorkoutPhase = "work" | "rest" | "done";

/** Bir hareketin set/süre reçetesi. Çağıran hesaplar, indirgeyici uygular. */
export type Prescription = {
  totalSets: number;
  workSeconds: number;
  restSeconds: number;
};

export type SessionState = {
  /** Oynatıcıdaki sıranın uzunluğu. 0 ise oynatıcı kapalı. */
  queueLength: number;
  /** Sıradaki aktif hareketin konumu; null ise oynatıcı kapalı. */
  activeIndex: number | null;
  phase: WorkoutPhase;
  currentSet: number;
  /** Geri sayım saniyesi. Süre sayacı kapalıyken kullanılmaz. */
  timer: number;
  running: boolean;
  /** Tamamlanan ve atlanan hareketlerin konumları. */
  completed: number[];
  skipped: number[];
  /** Seansın toplam süresi ve tahmini yakımı. Sayaç kapalıyken de işler. */
  elapsedSeconds: number;
  calories: number;
};

export const initialSessionState: SessionState = {
  queueLength: 0,
  activeIndex: null,
  phase: "work",
  currentSet: 1,
  timer: 0,
  running: false,
  completed: [],
  skipped: [],
  elapsedSeconds: 0,
  calories: 0,
};

/**
 * Eylemler reçeteyi ve tercihi KENDİLERİ taşır.
 *
 * Alternatifi indirgeyiciye üçüncü bir "bağlam" argümanı vermekti; o da
 * `useReducer` ile çalışmıyor. Böylece indirgeyici standart kalıyor ve saf
 * olmaya devam ediyor.
 */
export type SessionAction =
  | { type: "open"; index: number; queueLength: number; prescription: Prescription }
  | { type: "goTo"; index: number; prescription: Prescription }
  | { type: "toggleRunning" }
  /** Geri sayımı durdurur; hareketi ve ilerlemeyi bırakmaz. */
  | { type: "stop" }
  | { type: "completePhase"; prescription: Prescription; timerEnabled: boolean }
  | { type: "skip"; prescription: Prescription }
  | { type: "tick"; prescription: Prescription; timerEnabled: boolean; caloriesPerSecond: number }
  | { type: "close" }
  /** Set sayısı elle değiştirildi; silinen setlerin ötesindeki aktif set geri çekilir. */
  | { type: "clampSet"; totalSets: number };

const withCompleted = (completed: number[], index: number): number[] =>
  completed.includes(index) ? completed : [...completed, index];

/** Bir harekete geçiş: sayaç başa sarar, seans sayaçlarına dokunulmaz. */
function enterExercise(state: SessionState, index: number, prescription: Prescription): SessionState {
  return {
    ...state,
    activeIndex: index,
    timer: prescription.workSeconds,
    running: false,
    phase: "work",
    currentSet: 1,
  };
}

/**
 * Sayaç çalışıyor mu?
 *
 * Süre sayacı KAPALIYKEN geri sayım yoktur, ama antrenman ekranı açık olduğu
 * sürece seans süresi ve kalori işlemeye devam eder — aksi hâlde kaydedilen
 * antrenman "1 saniye" olarak düşerdi.
 */
export function isCounting(state: SessionState, timerEnabled: boolean): boolean {
  if (state.activeIndex === null) return false;
  return timerEnabled ? state.running : state.phase !== "done";
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "open": {
      // Yeni seans: tamamlanan/atlanan listeleri ve seans sayaçları sıfırlanır.
      return {
        ...initialSessionState,
        queueLength: action.queueLength,
        activeIndex: action.index,
        timer: action.prescription.workSeconds,
      };
    }

    case "goTo":
      // Seans içinde hareket değişimi: ilerleme KORUNUR.
      return enterExercise(state, action.index, action.prescription);

    case "toggleRunning":
      return { ...state, running: !state.running };

    case "stop":
      return state.running ? { ...state, running: false } : state;

    case "completePhase": {
      if (state.activeIndex === null) return state;
      const { prescription, timerEnabled } = action;
      const stopped = { ...state, running: false };
      if (state.phase === "rest") {
        return { ...stopped, currentSet: state.currentSet + 1, phase: "work", timer: prescription.workSeconds };
      }
      // Set "tamamlandı" diye işaretlenmez: kayda giren şey kullanıcının
      // gerçekten yazdığı değerdir. Boş bırakılan set antrenmanı tamamlamayı
      // engellemez, yalnızca kaydedilmez.
      if (state.currentSet < prescription.totalSets) {
        // Süre sayacı kapalıyken beklenecek geri sayım yok; doğrudan sonraki set.
        if (!timerEnabled) return { ...stopped, currentSet: state.currentSet + 1, timer: 0 };
        return { ...stopped, phase: "rest", timer: prescription.restSeconds };
      }
      return { ...stopped, phase: "done", timer: 0, completed: withCompleted(state.completed, state.activeIndex) };
    }

    case "skip": {
      if (state.activeIndex === null) return state;
      const skipped = state.skipped.includes(state.activeIndex) ? state.skipped : [...state.skipped, state.activeIndex];
      const next = { ...state, skipped };
      if (state.activeIndex < state.queueLength - 1) return enterExercise(next, state.activeIndex + 1, action.prescription);
      return { ...next, phase: "done", timer: 0, running: false };
    }

    case "tick": {
      const { prescription, timerEnabled, caloriesPerSecond } = action;
      if (!isCounting(state, timerEnabled)) return state;
      // Seans süresi ve kalori her sayan saniyede işler.
      const ticked = {
        ...state,
        elapsedSeconds: state.elapsedSeconds + 1,
        calories: state.calories + caloriesPerSecond,
      };
      if (!timerEnabled) return ticked;
      if (state.timer > 1) return { ...ticked, timer: state.timer - 1 };
      // Geri sayım bitti: faz ilerler.
      if (state.phase === "work" && state.currentSet < prescription.totalSets) {
        return { ...ticked, phase: "rest", timer: prescription.restSeconds };
      }
      if (state.phase === "rest") {
        // Yeni set kendiliğinden BAŞLAMAZ: kullanıcı hazır olduğunda başlatır.
        return { ...ticked, currentSet: state.currentSet + 1, phase: "work", running: false, timer: prescription.workSeconds };
      }
      return {
        ...ticked,
        phase: "done",
        running: false,
        timer: 0,
        completed: state.activeIndex === null ? state.completed : withCompleted(state.completed, state.activeIndex),
      };
    }

    case "clampSet": {
      const clamped = Math.min(state.currentSet, Math.max(1, action.totalSets));
      return clamped === state.currentSet ? state : { ...state, currentSet: clamped };
    }

    case "close":
      return { ...state, activeIndex: null, running: false };

    default:
      return state;
  }
}

/**
 * Seans kaydına yazılacak tamamlanmış hareketler.
 *
 * Son hareket "done" fazındaysa ama listeye henüz girmemişse (kullanıcı
 * "Antrenmanı kaydet"e bastığında olan tam olarak budur) o da sayılır —
 * atlanmadığı sürece.
 */
export function completedForFinish(state: SessionState): number[] {
  const { activeIndex, phase, skipped, completed } = state;
  if (activeIndex === null || phase !== "done") return completed;
  if (skipped.includes(activeIndex) || completed.includes(activeIndex)) return completed;
  return [...completed, activeIndex];
}
