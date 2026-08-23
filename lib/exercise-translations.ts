import type { Exercise } from "@/types/exercise";
import type { Locale } from "@/lib/i18n/server";

const labelsTr: Record<string, string> = {
  abdominals: "Karın",
  abductors: "Kalça dışı",
  adductors: "İç bacak",
  biceps: "Biseps",
  calves: "Baldır",
  chest: "Göğüs",
  forearms: "Ön kol",
  glutes: "Kalça",
  hamstrings: "Arka bacak",
  lats: "Kanat",
  "lower back": "Bel",
  "middle back": "Orta sırt",
  quadriceps: "Ön bacak",
  shoulders: "Omuz",
  traps: "Trapez",
  triceps: "Arka kol",
  bands: "Direnç bandı",
  barbell: "Halter",
  "body only": "Vücut ağırlığı",
  cable: "Kablo",
  dumbbell: "Dambıl",
  "e-z curl bar": "EZ bar",
  "exercise ball": "Egzersiz topu",
  kettlebells: "Kettlebell",
  machine: "Makine",
  "medicine ball": "Sağlık topu",
  none: "Ekipmansız",
  other: "Diğer",
  beginner: "Başlangıç",
  intermediate: "Orta seviye",
  expert: "İleri seviye",
  cardio: "Kardiyo",
  "olympic weightlifting": "Olimpik kaldırış",
  plyometrics: "Pliyometrik",
  powerlifting: "Güç kaldırışı",
  strength: "Kuvvet",
  stretching: "Esneme",
  compound: "Bileşik",
  isolation: "İzole",
  push: "İtiş",
  pull: "Çekiş",
  static: "Sabit",
};

const labelsEn: Record<string, string> = {
  abdominals: "Abs",
  abductors: "Abductors",
  adductors: "Adductors",
  biceps: "Biceps",
  calves: "Calves",
  chest: "Chest",
  forearms: "Forearms",
  glutes: "Glutes",
  hamstrings: "Hamstrings",
  lats: "Lats",
  "lower back": "Lower back",
  "middle back": "Middle back",
  quadriceps: "Quads",
  shoulders: "Shoulders",
  traps: "Traps",
  triceps: "Triceps",
  bands: "Resistance band",
  barbell: "Barbell",
  "body only": "Bodyweight",
  cable: "Cable",
  dumbbell: "Dumbbell",
  "e-z curl bar": "EZ bar",
  "exercise ball": "Exercise ball",
  kettlebells: "Kettlebell",
  machine: "Machine",
  "medicine ball": "Medicine ball",
  none: "No equipment",
  other: "Other",
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Advanced",
  cardio: "Cardio",
  "olympic weightlifting": "Olympic weightlifting",
  plyometrics: "Plyometrics",
  powerlifting: "Powerlifting",
  strength: "Strength",
  stretching: "Stretching",
  compound: "Compound",
  isolation: "Isolation",
  push: "Push",
  pull: "Pull",
  static: "Static",
};

function labelsFor(locale: Locale) {
  return locale === "en" ? labelsEn : labelsTr;
}

export function translateExerciseLabel(value: string | null | undefined, locale: Locale = "tr", fallback = locale === "en" ? "Not specified" : "Belirtilmemiş") {
  if (!value) return fallback;
  return labelsFor(locale)[value.toLocaleLowerCase("en-US")] || value;
}

export function translateExerciseList(values: string[], locale: Locale = "tr") {
  return values.map((value) => translateExerciseLabel(value, locale)).join(" · ");
}

export function turkishExerciseInstructions(exercise: Pick<Exercise, "name" | "force" | "category" | "primaryMuscles">, locale: Locale = "tr") {
  const name = exercise.name.toLocaleLowerCase("en-US");

  if (locale === "en") {
    const controlledEn = "Keep your torso stable throughout the movement, don't lock your joints, and stop if you feel pain.";
    if (/stretch/.test(name) || exercise.category === "stretching") {
      return [
        "Get into a comfortable starting position and steady your breathing.",
        "Ease in slowly until you feel a gentle stretch in the target muscle; don't bounce.",
        "Hold the position under control and return to the start at the same pace.",
      ];
    }
    if (/sprint|throw|bound|jump/.test(name) || exercise.category === "cardio" || exercise.category === "plyometrics") {
      return [
        "Take a balanced stance, brace your core, and clear space around you.",
        "Learn the movement slowly first, then build up the pace without losing form.",
        "Finish soft and controlled; don't hold your breath or lock your joints.",
      ];
    }
    if (/squat|lunge|step|leg press/.test(name)) {
      return [
        "Place your feet evenly, keep your chest up, and brace your core.",
        "Lower your hips under control while tracking your knees over your feet.",
        "Drive through your heels to rise and avoid locking your knees at the top.",
      ];
    }
    if (/deadlift|good morning/.test(name)) {
      return [
        "Keep the weight close to your body, spine neutral, and core braced.",
        "Hinge forward by sending your hips back; move from your hips, not your lower back.",
        "Drive through your heels and bring your hips forward to stand up under control.",
      ];
    }
    if (/bridge|hip raise|hip extension/.test(name)) {
      return [
        "Support your back, plant your feet firmly, and brace your core lightly.",
        "Push through your heels to lift your hips and squeeze your glutes at the top.",
        "Lower back down slowly without over-arching your lower back.",
      ];
    }
    if (/curl/.test(name) && !/leg curl/.test(name)) {
      return [
        "Keep your elbows close to your torso and your shoulders down.",
        "Pull the weight toward you under control without swinging.",
        "Lower the weight back down slowly while keeping tension on the muscle.",
      ];
    }
    if (/row|pulldown|pull-up|pull up/.test(name) || exercise.force === "pull") {
      return [
        "Keep your chest up, shoulders away from your ears, and torso stable.",
        "Pull your elbows back or down to bring your shoulder blades together.",
        "Extend your arms back out without losing control or rounding your shoulders forward.",
      ];
    }
    if (/press|push|dip|extension/.test(name) || exercise.force === "push") {
      return [
        "Get into a stable starting position and brace your shoulder blades and core.",
        "Lower the weight under control, then press it back up firmly but smoothly on the exhale.",
        "Return to the start without locking your elbows, keeping the same movement path.",
      ];
    }
    if (/crunch|leg lift|leg raise/.test(name) || exercise.primaryMuscles.includes("abdominals")) {
      return [
        "Keep your lower back supported and draw your belly in.",
        "Start the movement from your abs, not your neck or momentum.",
        "Exhale as you squeeze, then return slowly without losing control of your lower back.",
      ];
    }
    if (/calf/.test(name)) {
      return [
        "Place your feet evenly and use light support from a stable point.",
        "Raise your heels under control and briefly squeeze your calves at the top.",
        "Lower your heels slowly without letting your ankles roll in or out.",
      ];
    }
    return [
      "Get into a balanced starting position and steady your breathing.",
      controlledEn,
      "Complete the rep without rushing and return to the start under control.",
    ];
  }

  const controlled = "Hareket boyunca gövdeni sabit tut, eklemlerini kilitleme ve ağrı hissedersen dur.";

  if (/stretch/.test(name) || exercise.category === "stretching") {
    return [
      "Rahat bir başlangıç pozisyonu al ve nefesini düzenle.",
      "İlgili kas grubunda hafif gerilme hissedene kadar yavaşça ilerle; yaylanma yapma.",
      "Pozisyonu kontrollü koru ve aynı hızla başlangıca dön.",
    ];
  }
  if (/sprint|throw|bound|jump/.test(name) || exercise.category === "cardio" || exercise.category === "plyometrics") {
    return [
      "Dengeli bir duruş al, merkez bölgeni sık ve hareket alanını boş bırak.",
      "Hareketi önce düşük hızda öğren, ardından formun bozulmadan ritmi artır.",
      "Yumuşak ve kontrollü bitir; nefesini tutma ve eklemlerini kilitleme.",
    ];
  }
  if (/squat|lunge|step|leg press/.test(name)) {
    return [
      "Ayaklarını dengeli yerleştir, göğsünü açık ve merkez bölgeni sıkı tut.",
      "Kalçanı kontrollü indirirken dizlerini ayak yönünde takip ettir.",
      "Topuklarından güç alarak yüksel ve dizlerini üstte kilitleme.",
    ];
  }
  if (/deadlift|good morning/.test(name)) {
    return [
      "Ağırlığı vücuduna yakın tut, omurganı nötr ve karnını sıkı konumlandır.",
      "Kalçanı geriye göndererek öne katlan; hareketi belinden değil kalçandan yap.",
      "Topuklarından güç alıp kalçanı öne getirerek kontrollü biçimde doğrul.",
    ];
  }
  if (/bridge|hip raise|hip extension/.test(name)) {
    return [
      "Sırtını destekle, ayaklarını yere sağlam bas ve karnını hafifçe sık.",
      "Topuklarından iterek kalçanı kaldır ve tepede kalça kaslarını sık.",
      "Belini aşırı kavislendirmeden yavaşça başlangıç pozisyonuna dön.",
    ];
  }
  if (/curl/.test(name) && !/leg curl/.test(name)) {
    return [
      "Dirseklerini gövdene yakın ve omuzlarını aşağıda sabitle.",
      "Ağırlığı sallanmadan kontrollü biçimde kendine doğru çek.",
      "Kasın gerilimini koruyarak ağırlığı yavaşça başlangıca indir.",
    ];
  }
  if (/row|pulldown|pull-up|pull up/.test(name) || exercise.force === "pull") {
    return [
      "Göğsünü açık, omuzlarını kulaklarından uzak ve gövdeni sabit tut.",
      "Dirseklerini geriye veya aşağıya çekerek kürek kemiklerini birbirine yaklaştır.",
      "Kontrolü bırakmadan kollarını uzat ve omuzlarını öne düşürme.",
    ];
  }
  if (/press|push|dip|extension/.test(name) || exercise.force === "push") {
    return [
      "Dengeli bir başlangıç pozisyonu al, kürek kemiklerini ve merkez bölgeni sabitle.",
      "Ağırlığı kontrollü indir, ardından nefes vererek güçlü ama sarsıntısız biçimde it.",
      "Dirseklerini kilitlemeden başlangıç pozisyonuna dön ve hareket çizgisini koru.",
    ];
  }
  if (/crunch|leg lift|leg raise/.test(name) || exercise.primaryMuscles.includes("abdominals")) {
    return [
      "Belini destekli konumda tut ve karnını içeri doğru sık.",
      "Hareketi boyundan veya momentumdan değil karın kaslarından başlat.",
      "Nefes vererek sıkış, ardından bel kontrolünü kaybetmeden yavaşça dön.",
    ];
  }
  if (/calf/.test(name)) {
    return [
      "Ayak tabanını dengeli yerleştir ve bir destek noktasından hafifçe yardım al.",
      "Topuklarını kontrollü yükselt, üst noktada baldırlarını kısa süre sık.",
      "Topuklarını yavaşça indir ve ayak bileğinin içe ya da dışa kaçmasına izin verme.",
    ];
  }

  return [
    "Dengeli bir başlangıç pozisyonu al ve nefesini düzenle.",
    controlled,
    "Tekrarı acele etmeden tamamla ve başlangıç pozisyonuna kontrollü dön.",
  ];
}
