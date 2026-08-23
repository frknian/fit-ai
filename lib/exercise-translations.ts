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

const exerciseNameTerms: Array<[RegExp, string]> = [
  [/\ball fours\b/gi, "Dört ayak"], [/\bworld'?s greatest stretch\b/gi, "Tüm vücut esnetme"],
  [/\bab crunch machine\b/gi, "Karın sıkıştırma makinesi"], [/\bparallel bar dips?\b/gi, "Paralel bar itişi"],
  [/\bpushups?\b/gi, "Şınav"], [/\bpullups?\b/gi, "Barfiks"], [/\bwindmills?\b/gi, "Yel değirmeni"],
  [/\bair bike\b/gi, "Hava bisikleti"], [/\brecumbent bike\b/gi, "Yatay kondisyon bisikleti"],
  [/\b(?:ab|abs)\b/gi, "Karın"], [/\badductors?\b/gi, "İç bacak"], [/\babductors?\b/gi, "Dış kalça"],
  [/\bpulleys?\b/gi, "Makara"], [/\bleverage\b/gi, "Kaldıraçlı"], [/\bhammer\b/gi, "Çekiç"],
  [/\b(?:delt|deltoids?)\b/gi, "Omuz"], [/\bupright\b/gi, "Dik"], [/\bchains?\b/gi, "Zincir"],
  [/\bcrossover\b/gi, "Çapraz çekiş"], [/\blong\b/gi, "Uzun"], [/\blat\b/gi, "Kanat"],
  [/\bbridge\b/gi, "Köprü"], [/\bcross\b/gi, "Çapraz"], [/\bblocks?\b/gi, "Blok"],
  [/\boblique\b/gi, "Yan karın"], [/\belevated\b/gi, "Yükseltilmiş"], [/\bexternal\b/gi, "Dış"],
  [/\bhack\b/gi, "Hack"], [/\bbends?\b/gi, "Eğilme"], [/\bstep\b/gi, "Adım"],
  [/\battachment\b/gi, "Aparat"], [/\bconcentration\b/gi, "Konsantrasyon"], [/\bdepth\b/gi, "Derinlik"],
  [/\bdrags?\b/gi, "Sürükleme"], [/\bham\b/gi, "Arka bacak"], [/\bcone\b/gi, "Koni"],
  [/\bbalance\b/gi, "Denge"], [/\blifts?\b/gi, "Kaldırış"], [/\bhyperextensions?\b/gi, "Hiperekstansiyon"],
  [/\bmuscle\b/gi, "Kas"], [/\bdrill\b/gi, "Çalışması"], [/\blinear\b/gi, "Doğrusal"],
  [/\bresistance\b/gi, "Direnç"], [/\bspeed\b/gi, "Hız"], [/\bbackward\b/gi, "Geriye"],
  [/\bmid\b/gi, "Orta"], [/\bposition\b/gi, "Pozisyon"], [/\binternal\b/gi, "İç"],
  [/\brussian\b/gi, "Rus"], [/\bhandle\b/gi, "Tutacak"], [/\bdeficit\b/gi, "Yükselti"],
  [/\bversion\b/gi, "Sürümü"], [/\bbutt\b/gi, "Kalça"], [/\bkicks?\b/gi, "Tekme"],
  [/\bpronated\b/gi, "Pronasyon tutuşlu"], [/\bsupinated\b/gi, "Supinasyon tutuşlu"],
  [/\bfrog\b/gi, "Kurbağa"], [/\bhurdle\b/gi, "Engel"], [/\bbelow\b/gi, "Aşağıda"],
  [/\bhug\b/gi, "Sarılma"], [/\binverted\b/gi, "Ters"], [/\bexercise\b/gi, "Egzersiz"],
  [/\bjackknife\b/gi, "Çakı"], [/\btuck\b/gi, "Toparlanma"], [/\bolympic\b/gi, "Olimpik"],
  [/\bslam\b/gi, "Yere vurma"], [/\blaterals?\b/gi, "Yana açış"], [/\bplyo\b/gi, "Pliyometrik"],
  [/\bfeet\b/gi, "Ayaklar"], [/\bromanian\b/gi, "Romen"], [/\bharness\b/gi, "Koşum"],
  [/\bstride\b/gi, "Uzun adım"], [/\bstiff\b/gi, "Düz"], [/\bforward\b/gi, "İleri"],
  [/\bfarmer'?s?\b/gi, "Çiftçi"], [/\bhandstand\b/gi, "El duruşu"], [/\bpike\b/gi, "Çakı"],
  [/\bflexion\b/gi, "Bükme"], [/\bextension\b/gi, "Uzatma"], [/\bposterior\b/gi, "Arka"],
  [/\bdiagonal\b/gi, "Çapraz"], [/\bbear\b/gi, "Ayı"], [/\bcrawl\b/gi, "Yürüyüş"],
  [/\bgood morning\b/gi, "Günaydın"], [/\bmountain climbers?\b/gi, "Dağ tırmanışı"],
  [/\bskull crushers?\b/gi, "Alına indiriş"], [/\bbench press\b/gi, "Sehpa itişi"],
  [/\bchest press\b/gi, "Göğüs itişi"], [/\bshoulder press\b/gi, "Omuz itişi"],
  [/\bleg press\b/gi, "Bacak itişi"], [/\bmilitary press\b/gi, "Askeri itiş"],
  [/\bsit[- ]ups?\b/gi, "Mekik"], [/\bpull[- ]ups?\b/gi, "Barfiks"],
  [/\bchin[- ]ups?\b/gi, "Ters tutuş barfiks"], [/\bpush[- ]ups?\b/gi, "Şınav"],
  [/\bpushdowns?\b/gi, "Aşağı itiş"], [/\bpulldowns?\b/gi, "Aşağı çekiş"],
  [/\bkickbacks?\b/gi, "Geri açış"], [/\brollouts?\b/gi, "İleri yuvarlanma"],
  [/\bbodyweight\b/gi, "Vücut ağırlığı"], [/\bone[- ]arm\b/gi, "Tek kol"],
  [/\bsingle[- ]arm\b/gi, "Tek kol"], [/\btwo[- ]arm\b/gi, "Çift kol"],
  [/\bone[- ]legged\b/gi, "Tek bacak"], [/\bsingle[- ]leg\b/gi, "Tek bacak"],
  [/\bstiff[- ]legged\b/gi, "Düz bacak"], [/\bstraight[- ]arm\b/gi, "Düz kol"],
  [/\bbent[- ]arm\b/gi, "Bükülü kol"], [/\bbent[- ]over\b/gi, "Öne eğilerek"],
  [/\bclose[- ]grip\b/gi, "Dar tutuş"], [/\bwide[- ]grip\b/gi, "Geniş tutuş"],
  [/\bmedium[- ]grip\b/gi, "Orta tutuş"], [/\bneutral[- ]grip\b/gi, "Nötr tutuş"],
  [/\boverhead\b/gi, "Baş üstü"], [/\bbehind the neck\b/gi, "Ense arkasına"],
  [/\bdumbbells?\b/gi, "Dambıl"], [/\bbarbells?\b/gi, "Halter"], [/\bkettlebells?\b/gi, "Girya"],
  [/\bmedicine ball\b/gi, "Sağlık topu"], [/\bexercise ball\b/gi, "Egzersiz topu"],
  [/\bresistance bands?\b/gi, "Direnç bandı"], [/\bcables?\b/gi, "Kablo"],
  [/\bsmith machine\b/gi, "Smith makinesi"], [/\bmachine\b/gi, "Makine"],
  [/\bpreacher\b/gi, "Scott sehpası"], [/\bbench\b/gi, "Sehpa"],
  [/\bcrunch(?:es)?\b/gi, "Karın sıkıştırma"], [/\bplank\b/gi, "Düz duruş"],
  [/\bsquats?\b/gi, "Çömelme"], [/\blunges?\b/gi, "Hamle"], [/\bdeadlifts?\b/gi, "Yerden kaldırış"],
  [/\brows?\b/gi, "Kürek çekiş"], [/\bcurls?\b/gi, "Büküş"], [/\bextensions?\b/gi, "Uzatış"],
  [/\braises?\b/gi, "Kaldırış"], [/\bpress(?:es)?\b/gi, "İtiş"], [/\bflyes?\b/gi, "Yana açış"],
  [/\bpullovers?\b/gi, "Baş üstü çekiş"], [/\bshrugs?\b/gi, "Omuz silkme"],
  [/\bstretch(?:es)?\b/gi, "Esnetme"], [/\bclean\b/gi, "Omuza alış"], [/\bsnatch\b/gi, "Koparma"], [/\bjerk\b/gi, "Silkme"],
  [/\bhip thrust\b/gi, "Kalça itişi"], [/\bhip\b/gi, "Kalça"], [/\bglutes?\b/gi, "Kalça"],
  [/\bhamstrings?\b/gi, "Arka bacak"], [/\bquadriceps?\b/gi, "Ön bacak"], [/\bquads?\b/gi, "Ön bacak"],
  [/\b(?:calf|calves)\b/gi, "Baldır"], [/\bchest\b/gi, "Göğüs"], [/\bshoulders?\b/gi, "Omuz"],
  [/\btriceps?\b/gi, "Arka kol"], [/\bbiceps?\b/gi, "Biseps"], [/\bforearms?\b/gi, "Ön kol"],
  [/\bwrists?\b/gi, "Bilek"], [/\bneck\b/gi, "Boyun"], [/\bback\b/gi, "Sırt"],
  [/\blegs?\b/gi, "Bacak"], [/\barms?\b/gi, "Kol"], [/\bknees?\b/gi, "Diz"], [/\bankles?\b/gi, "Ayak bileği"],
  [/\bstanding\b/gi, "Ayakta"], [/\bseated\b/gi, "Oturarak"], [/\blying\b/gi, "Yatarak"],
  [/\bkneeling\b/gi, "Diz çökerek"], [/\bprone\b/gi, "Yüzüstü"], [/\bsupine\b/gi, "Sırtüstü"],
  [/\bhanging\b/gi, "Asılı"], [/\bsuspended\b/gi, "Askıda"], [/\bwalking\b/gi, "Yürüyerek"],
  [/\balternating\b/gi, "Dönüşümlü"], [/\balternate\b/gi, "Dönüşümlü"], [/\breverse\b/gi, "Ters"],
  [/\bincline\b/gi, "Eğimli"], [/\bdecline\b/gi, "Ters eğimli"], [/\blateral\b/gi, "Yana"],
  [/\bfront\b/gi, "Ön"], [/\brear\b/gi, "Arka"], [/\binner\b/gi, "İç"], [/\bouter\b/gi, "Dış"],
  [/\bupper\b/gi, "Üst"], [/\blower\b/gi, "Alt"], [/\bhigh\b/gi, "Yüksek"], [/\blow\b/gi, "Alçak"],
  [/\bwide\b/gi, "Geniş"], [/\bnarrow\b/gi, "Dar"], [/\bclose\b/gi, "Yakın"], [/\bgrip\b/gi, "Tutuş"],
  [/\bstraight\b/gi, "Düz"], [/\bbent\b/gi, "Bükülü"], [/\bweighted\b/gi, "Ağırlıklı"],
  [/\bassisted\b/gi, "Destekli"], [/\bisometric\b/gi, "İzometrik"], [/\bpower\b/gi, "Güç"],
  [/\bjump(?:s)?\b/gi, "Sıçrama"], [/\bhops?\b/gi, "Sıçrayış"], [/\bbounds?\b/gi, "Atlamalı ilerleme"],
  [/\bsprints?\b/gi, "Sürat koşusu"], [/\bthrows?\b/gi, "Atış"], [/\brotation\b/gi, "Dönüş"],
  [/\bcircles?\b/gi, "Daire"], [/\btwists?\b/gi, "Burgu"], [/\bwalk\b/gi, "Yürüyüş"],
  [/\bfloor\b/gi, "Yerde"], [/\bwall\b/gi, "Duvar"], [/\bchair\b/gi, "Sandalye"],
  [/\bbox\b/gi, "Kutu"], [/\brope\b/gi, "Halat"], [/\bplate\b/gi, "Ağırlık plakası"],
  [/\bsled\b/gi, "Kızak"], [/\bball\b/gi, "Top"], [/\bband(?:s)?\b/gi, "Bant"],
  [/\bpalms?\b/gi, "Avuçlar"], [/\bhead\b/gi, "Baş"], [/\bside\b/gi, "Yan"],
  [/\bsplit\b/gi, "Ayrık"], [/\bsingle\b/gi, "Tek"], [/\bdouble\b/gi, "Çift"],
  [/\bpull\b/gi, "Çekiş"], [/\bpush\b/gi, "İtiş"], [/\bskip\b/gi, "Atlama"],
  [/\badvanced\b/gi, "İleri"], [/\bintermediate\b/gi, "Orta"], [/\bbeginner\b/gi, "Başlangıç"],
  [/\bdynamic\b/gi, "Dinamik"], [/\bextended\b/gi, "Uzatılmış"], [/\brange\b/gi, "Hareket aralığı"],
  [/\bbehind\b/gi, "Arkasında"], [/\bbetween\b/gi, "Arasında"], [/\bmiddle\b/gi, "Orta"],
  [/\bbody\b/gi, "Gövde"], [/\bgroin\b/gi, "Kasık"], [/\bflexors?\b/gi, "Bükücü"],
  [/\bface\b/gi, "Yüze"], [/\bpalms?\b/gi, "Avuç"], [/\bopen\b/gi, "Açık"],
  [/\belbows?\b/gi, "Dirsekler"], [/\bhands?\b/gi, "Eller"], [/\bchin\b/gi, "Çene"],
  [/\bcat\b/gi, "Kedi"], [/\bdancer'?s\b/gi, "Dansçı"], [/\bdonkey\b/gi, "Eşek"],
  [/\bstability\b/gi, "Denge"], [/\bpoint\b/gi, "Nokta"], [/\bstance\b/gi, "Duruş"],
  [/\bmultiple\b/gi, "Çoklu"], [/\bresponse\b/gi, "Tepki"], [/\brelease\b/gi, "Bırakma"],
  [/\brun\b/gi, "Koşu"], [/\bfigure\b/gi, "Şekil"], [/\bhang\b/gi, "Asılı"],
  [/\bpass\b/gi, "Geçiriş"], [/\bpistol\b/gi, "Tabanca"], [/\bseesaw\b/gi, "Tahterevalli"],
  [/\bthruster\b/gi, "İtişli çömelme"], [/\bturkish get[- ]up\b/gi, "Türk kalkışı"], [/\bstyle\b/gi, "biçimi"],
  [/\bdead\b/gi, "Yerden"], [/\bflat\b/gi, "Düz"], [/\biron crosses?\b/gi, "Haç açışı"],
  [/\bone\b/gi, "Tek"], [/\btwo\b/gi, "Çift"], [/\bfull\b/gi, "Tam"], [/\bpartial\b/gi, "Kısmi"],
  [/\band\b/gi, "ve"], [/\bwith\b/gi, "ile"], [/\bwithout\b/gi, "olmadan"], [/\bfrom\b/gi, "başlangıçlı"],
  [/\bon\b/gi, "üzerinde"], [/\bin\b/gi, "içinde"], [/\bover\b/gi, "üzerinden"], [/\bup\b/gi, "yukarı"], [/\bdown\b/gi, "aşağı"],
  [/\bagainst\b/gi, "karşı"], [/\bthrough\b/gi, "içinden"], [/\bto\b/gi, "doğru"],
  [/\bthe\b/gi, ""], [/\ban?\b/gi, ""], [/\bof\b/gi, ""],
];

const exactExerciseNamesTr: Record<string, string> = {
  "Ab Roller": "Karın Tekerleği",
  Adductor: "İç Bacak Makinesi",
  "Air Bike": "Hava Bisikleti",
  "Anterior Tibialis-SMR": "Ön Kaval Kası SMR",
  "Atlas Stone Trainer": "Atlas Taşı Antrenmanı",
  "Atlas Stones": "Atlas Taşları",
  "Backward Drag": "Geriye Kızak Çekişi",
  "Balance Board": "Denge Tahtası",
  "Battling Ropes": "Savaş Halatları",
  Bicycling: "Bisiklet Sürüşü",
  "Bicycling, Stationary": "Sabit Bisiklet",
  "Brachialis-SMR": "Brakiyalis SMR",
  "Butt-Ups": "Kalça Yukarı Kaldırış",
  "Butt Lift (Bridge)": "Kalça Kaldırma (Köprü)",
  Butterfly: "Kelebek Göğüs Açışı",
  "Car Drivers": "Direksiyon Çevirme",
  "Carioca Quick Step": "Carioca Hızlı Adım",
  "Child's Pose": "Çocuk Duruşu",
  "Circus Bell": "Sirk Dambılı Kaldırışı",
  Cocoons: "Koza Karın Sıkıştırma",
  "Conan's Wheel": "Conan Çarkı",
  Crucifix: "Haç Duruşu",
  "Downward Facing Balance": "Aşağı Bakan Denge Duruşu",
  "EZ-Bar Skullcrusher": "EZ Bar Alına İndiriş",
  "Elliptical Trainer": "Eliptik Bisiklet",
  "Fast Skipping": "Hızlı İp Atlama",
  "Flutter Kicks": "Çırpma Tekmeleri",
  "Foot-SMR": "Ayak Tabanı SMR",
  "Gironda Sternum Chins": "Gironda Göğüse Barfiks",
  Groiners: "Dinamik Kasık Esnetme",
  "Heavy Bag Thrust": "Ağır Çuval İtişi",
  "Iliotibial Tract-SMR": "İliotibial Bant SMR",
  Inchworm: "Tırtıl Yürüyüşü",
  "Iron Cross": "Demir Haç",
  "Jogging, Treadmill": "Koşu Bandında Hafif Koşu",
  "Keg Load": "Fıçı Yükleme",
  "Landmine 180's": "Landmine 180 Derece Dönüş",
  "Landmine Linear Jammer": "Landmine Doğrusal İtiş",
  "Latissimus Dorsi-SMR": "Kanat Kası SMR",
  "Linear 3-Part Start Technique": "Doğrusal Üç Aşamalı Çıkış Tekniği",
  "Log Lift": "Kütük Kaldırma",
  "London Bridges": "Londra Köprüsü",
  "Looking At Ceiling": "Tavana Bakış Esnetmesi",
  "Moving Claw Series": "Hareketli Pençe Serisi",
  "Parallel Bar Dip": "Paralel Bar Dips",
  "Pelvic Tilt Into Bridge": "Pelvik Eğişten Köprüye Geçiş",
  "Peroneals-SMR": "Peroneal Kas SMR",
  "Piriformis-SMR": "Piriformis Kası SMR",
  Pullups: "Barfiks",
  Pushups: "Şınav",
  Pyramid: "Piramit Koşusu",
  "Quick Leap": "Hızlı Sıçrayış",
  "Rack Delivery": "Raf Pozisyonuna Alış",
  "Rack Pulls": "Raf Yüksekliğinden Çekiş",
  "Recumbent Bike": "Yatay Kondisyon Bisikleti",
  "Rhomboids-SMR": "Romboid Kasları SMR",
  "Rickshaw Carry": "Rickshaw Ağırlık Taşıma",
  "Ring Dips": "Halka Dips",
  "Rowing, Stationary": "Sabit Kürek Ergometresi",
  "Running, Treadmill": "Koşu Bandında Koşu",
  "Sandbag Load": "Kum Torbası Yükleme",
  "Scissor Kick": "Makas Tekmesi",
  Skating: "Paten Adımı",
  "Sledgehammer Swings": "Balyoz Savurma",
  "Spell Caster": "Çapraz Ağırlık Savurma",
  "Spider Crawl": "Örümcek Yürüyüşü",
  Stairmaster: "Merdiven Tırmanma Makinesi",
  "Step Mill": "Basamak Makinesi",
  "Stomach Vacuum": "Karın Vakumu",
  Superman: "Süpermen Duruşu",
  "Thigh Abductor": "Kalça Dışa Açış Makinesi",
  "Thigh Adductor": "İç Bacak Kapama Makinesi",
  "Tire Flip": "Lastik Çevirme",
  "Toe Touchers": "Ayak Ucuna Dokunma",
  "V-Bar Pullup": "V Bar Barfiks",
  "Vertical Swing": "Dikey Savurma",
  Windmills: "Yel Değirmeni",
};

export function translateExerciseName(value: string, locale: Locale = "tr") {
  if (locale === "en") return value;
  const exact = exactExerciseNamesTr[value];
  if (exact) return exact;
  return exerciseNameTerms.reduce((name, [pattern, replacement]) => name.replace(pattern, replacement), value)
    .replace(/\s+/g, " ").replace(/\s+-\s+/g, " - ").trim();
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
    if (/sit-up|sit up|crunch|leg lift|leg raise|plank/.test(name) || exercise.primaryMuscles.includes("abdominals")) {
      return [
        "Keep your lower back supported and draw your belly in.",
        "Start the movement from your abs, not your neck or momentum.",
        "Exhale as you squeeze, then return slowly without losing control of your lower back.",
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
  if (/sit-up|sit up|crunch|leg lift|leg raise|plank/.test(name) || exercise.primaryMuscles.includes("abdominals")) {
    return [
      "Belini destekli konumda tut ve karnını içeri doğru sık.",
      "Hareketi boyundan veya momentumdan değil karın kaslarından başlat.",
      "Nefes vererek sıkış, ardından bel kontrolünü kaybetmeden yavaşça dön.",
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
