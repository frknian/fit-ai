"use client";

import { useMemo, useState } from "react";
import { Check, Plus, RefreshCw, X } from "lucide-react";
import { ExerciseAnimation, exerciseLibrary, catalogItemToWorkout, getMotionGuide, movementInstructions, type AiWorkout, type CatalogItem } from "@/components/FitAiApp";
import { OnboardingIcon } from "@/components/onboarding/OnboardingIcon";
import { alternativeExercises } from "@/lib/exercise-alternatives";
import { setStoredCustomRegions, setStoredSmartProgramSwaps, useStoredCustomRegions, useStoredSmartProgramSwaps } from "@/lib/preferences";
import { buildReadyProgram, matchesProfile } from "@/lib/ready-programs";
import {
  BODY_REGIONS,
  CUSTOM_REGION_LIMIT,
  DEFAULT_PROGRAM_EXERCISE,
  PROGRAM_EXERCISE_LIMITS,
  TRAINING_AREAS,
  distributeRegionExercises,
  estimateProgramMinutes,
  moveProgramExercise,
  nextFreeSlot,
  normalizeCustomRegions,
  normalizeProgramExercise,
  placeToProfile,
  programExerciseNames,
  programKey,
  removeCustomRegion,
  upsertCustomRegion,
  type BodyRegion,
  type CustomProgram,
  type CustomRegion,
  type ProgramExercise,
  type ProgramProgress,
  type TrainingPlace,
} from "@/lib/training-programs";
import { useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";
import { movementArea, movementName, movementPrescription } from "@/lib/workout-localization";

type Selection =
  | { kind: "smart" }
  | { kind: "fullBody"; place: TrainingPlace }
  // Bölge artık tek bir `area` değil, bir alan LİSTESİDİR: "üst vücut" ya da
  // "itiş günü" gibi birleşik gruplar da aynı yapıyla çalışır
  // (bkz. lib/training-programs.ts → BODY_REGIONS).
  | { kind: "split"; place: TrainingPlace; regionId: string; regionName: string; areas: string[] }
  | { kind: "custom"; id: string };

export function TrainingPrograms({
  equipmentText, isGym, smartWorkouts, customPrograms, progress,
  onStart, onSaveCustom, onDeleteCustom, onOpenLibrary, smartExtra, smartFallback = false,
}: {
  equipmentText: string;
  /** Profildeki ortam. Sayfadaki salon/ev seçimi kaldırıldı: kullanıcı bunu
      profil testinde zaten söylüyordu ve iki yerde durunca ekrandaki seçim
      profili sessizce eziyor, evde çalışan birine salon aleti çıkarabiliyordu. */
  isGym: boolean;
  /** Profil testinden AI'ın ürettiği program. Boşsa akıllı kart kilitli. */
  smartWorkouts: AiWorkout[];
  customPrograms: CustomProgram[];
  progress: Record<string, ProgramProgress>;
  onStart: (workouts: AiWorkout[], key: string) => void;
  onSaveCustom: (program: CustomProgram) => void;
  /** Hareket kütüphanesini açar. Kütüphane bu sekmenin altında durur
      (bkz. docs/MOBIL_TASARIM_PLANI.md 3.2.1); eskiden başlık çubuğundaki
      bir ikondu ve antrenmanla ilişkisi görünmüyordu. */
  onOpenLibrary?: () => void;
  onDeleteCustom: (id: string) => void;
  /** Akıllı programın altında gösterilecek AI raporu / uyarlama kartı. */
  smartExtra?: React.ReactNode;
  /** Program AI'dan değil, yerel yedekten geldi. */
  smartFallback?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [builderId, setBuilderId] = useState<string | null>(null);
  const [regionBuilderOpen, setRegionBuilderOpen] = useState(false);
  const storedRegionsRaw = useStoredCustomRegions();
  const customRegions = useMemo(() => normalizeCustomRegions(storedRegionsRaw), [storedRegionsRaw]);
  const place: TrainingPlace = isGym ? "gym" : "home";

  // Akıllı program her seansta AYNI hareket havuzunu verir; AI tek bir liste
  // üretir, gün gün farklı bir set değil. Kullanıcı ikinci günde de aynı
  // hareketleri görünce şaşırıyordu. Kalıcı bir "günlük split" AI şeması
  // gerektirir; bu daha küçük ve hemen kullanılabilir çözüm, kullanıcının
  // tekrar hissettiği hareketi kendisinin değiştirmesine izin verir.
  //
  // Değişiklik kalıcı tercihte (lib/preferences.ts) İSME göre saklanır —
  // eskiden bileşen state'inde İNDEKSE göre tutuluyordu ve ekrandan çıkınca
  // kayboluyordu. İsme göre saklamanın nedeni: plan yeniden üretilince
  // hareketlerin sırası değişebilir; "bu hareketi görürsen böyle değiştir"
  // anlamı ancak isimle sıraya bağlı kalmadan geçerliliğini korur.
  const storedSwaps = useStoredSmartProgramSwaps();
  const [swapOpenFor, setSwapOpenFor] = useState<number | null>(null);
  // Değiştirdikten hemen sonra kısa bir onay yazısı göstermek için; kalıcı
  // değildir, yalnız bu ekran açıkken görünür.
  const [justSwappedName, setJustSwappedName] = useState<string | null>(null);

  // Başka bir programa geçildiğinde açık kalan panel yanlış hareketin
  // altında görünmesin diye kapatılır.
  function openSelection(next: Selection | null) {
    setSwapOpenFor(null);
    setSelection(next);
  }

  const smartListWithSwaps = useMemo<AiWorkout[]>(() => smartWorkouts.map((item) => {
    const replacementName = storedSwaps[item.name];
    const replacement = replacementName ? exerciseLibrary.find((candidate) => candidate.name === replacementName) : null;
    // Set/tekrar/dinlenme reçetesi korunur; yalnızca hareketin kendisi değişir.
    return replacement ? { ...catalogItemToWorkout(replacement), sets: item.sets, rest: item.rest, seconds: item.seconds } : item;
  }), [smartWorkouts, storedSwaps]);

  function swapAlternatives(index: number): CatalogItem[] {
    const original = smartWorkouts[index];
    if (!original) return [];
    const profile = placeToProfile(place, equipmentText);
    const pool = exerciseLibrary.filter((item) => matchesProfile(item, profile));
    return alternativeExercises({ name: original.name, area: original.area, bodyweight: Boolean(original.bodyweight), requires: [] }, pool);
  }

  function applySwap(index: number, replacement: CatalogItem) {
    const original = smartWorkouts[index];
    if (!original) return;
    setStoredSmartProgramSwaps({ ...storedSwaps, [original.name]: replacement.name });
    setSwapOpenFor(null);
    setJustSwappedName(replacement.name);
    window.setTimeout(() => setJustSwappedName((current) => current === replacement.name ? null : current), 2600);
  }

  function revertSwap(index: number) {
    const original = smartWorkouts[index];
    if (!original) return;
    const next = { ...storedSwaps };
    delete next[original.name];
    setStoredSmartProgramSwaps(next);
    setSwapOpenFor(null);
  }

  // Katalogdaki ham alan adının ("Göğüs") ekrandaki karşılığı. Sözlükte
  // olmayan bir alan gelirse ham ad basılır; ekran boş kalmaz.
  function areaLabel(area: string): string {
    return t.programs.areaLabels[area as keyof typeof t.programs.areaLabels] ?? area;
  }

  function regionLabel(region: BodyRegion): string {
    return t.programs.regions[region.id as keyof typeof t.programs.regions] ?? region.areas.map(areaLabel).join(" + ");
  }

  // Seçili programın hareketleri. Hepsi TEK yerden üretilir; kart ile açılan
  // liste arasında fark olmaması için başlangıç da bu listeyi kullanır.
  const activeExercises = useMemo<CatalogItem[]>(() => {
    if (!selection) return [];
    if (selection.kind === "smart") return [];
    if (selection.kind === "custom") {
      const program = customPrograms.find((item) => item.id === selection.id);
      if (!program) return [];
      // İsimle saklanır; katalogdan düşen bir hareket sessizce atlanır.
      return programExerciseNames(program)
        .map((name) => exerciseLibrary.find((item) => item.name === name))
        .filter((item): item is CatalogItem => Boolean(item));
    }
    const profile = placeToProfile(selection.place, equipmentText);
    if (selection.kind === "fullBody") return buildReadyProgram(exerciseLibrary, profile);
    // Birleşik bölgelerde hareketler bölgeler arasında sırayla dağıtılır;
    // yoksa alfabetik sıra yüzünden "üst vücut" seansı baştan sona göğüs
    // hareketi olabiliyordu (bkz. distributeRegionExercises).
    const pool = exerciseLibrary.filter((item) => matchesProfile(item, profile));
    return distributeRegionExercises(pool, selection.areas, selection.areas.length > 1 ? 8 : 6);
  }, [selection, equipmentText, customPrograms]);

  const activeKey = selection
    ? selection.kind === "custom" ? programKey("custom", undefined, selection.id)
      : selection.kind === "smart" ? programKey("smart")
      // Bölgesel programın ilerlemesi bölge bazında sayılır: "bacak günü" ile
      // "üst vücut" aynı sayaca yazılırsa ikisi de anlamsızlaşır.
      : selection.kind === "split" ? `${programKey("split", selection.place)}:${selection.regionId}`
      : programKey(selection.kind, selection.place)
    : "";

  function startSelection() {
    if (!selection) return;
    if (selection.kind === "smart") { onStart(smartListWithSwaps, activeKey); return; }
    if (activeExercises.length) onStart(activeExercises.map(catalogItemToWorkout), activeKey);
  }

  function progressLabel(key: string) {
    const entry = progress[key];
    if (!entry?.sessions) return t.programs.notStarted;
    return t.programs.sessionCount(entry.sessions);
  }

  // --- Özel program kurucusu ---
  if (builderId) {
    const existing = customPrograms.find((program) => program.id === builderId);
    return <CustomProgramBuilder
      slotId={builderId}
      initial={existing}
      onCancel={() => setBuilderId(null)}
      onSave={(program) => { onSaveCustom(program); setBuilderId(null); openSelection({ kind: "custom", id: program.id }); }}
      onDelete={existing ? () => { onDeleteCustom(existing.id); setBuilderId(null); } : undefined}
    />;
  }

  // --- Seçili programın hareket listesi ---
  if (selection) {
    const title = selection.kind === "smart" ? t.programs.smartTitle
      : selection.kind === "fullBody" ? t.programs.fullBodyTitle
      : selection.kind === "split" ? selection.regionName
      : customPrograms.find((program) => program.id === selection.id)?.name ?? t.programs.customTitle;
    const list: AiWorkout[] = selection.kind === "smart" ? smartListWithSwaps : activeExercises.map(catalogItemToWorkout);

    return <section className="programs" id="ready-programs">
      <div className="section-title"><div className="eyebrow">{t.programs.eyebrow}</div><button type="button" className="back-btn" onClick={() => openSelection(null)}>{t.programs.backToPrograms}</button></div>
      <h2>{title}</h2>
      {/* Ortam etiketi kaldırıldı: seçim artık profilden geliyor, ekranda
          değiştirilebilir bir şey değil. */}
      <p className="programs-note">{progressLabel(activeKey)}</p>
      {selection.kind === "smart" && smartFallback && <p className="programs-note programs-fallback">{t.programs.smartFallbackNote}</p>}

      {list.length ? <>
        <button type="button" className="start-btn" onClick={startSelection}>{t.programs.startSession} <span>→</span></button>
        {/* Hareket anlatımı listede kalır: kullanıcı başlamadan önce ne
            yapacağını görebilmeli, oynatıcıya girmek zorunda kalmamalı. */}
        <div className="program-exercise-list">{list.map((item, index) => {
          const guide = getMotionGuide(item, locale);
          // "item" akıllı programda değiştirilmiş hareketi taşır; hangi
          // orijinal hareketin YERİNE geçtiğini bilmek için asıl listeye
          // bakılır — aksi hâlde ikinci bir değişiklikte yanlış bölge
          // (değiştirilmiş hareketin bölgesi) referans alınırdı.
          const original = selection.kind === "smart" ? smartWorkouts[index] : null;
          const isSwapped = Boolean(original && storedSwaps[original.name]);
          const alternatives = selection.kind === "smart" ? swapAlternatives(index) : [];
          return <article key={`${item.name}-${index}`}>
            {/* Listede animasyon OYNAMAZ: onlarca kareyi aynı anda döndürmek
                telefonda hem pili hem kaydırmayı yiyordu. */}
            <ExerciseAnimation exercise={item} compact autoplay={false} />
            <div>
              <div className="program-exercise-head">
                <strong>{movementName(item)}</strong>
                {/* Yalnız akıllı programda: AI aynı listeyi her gün tekrarlar,
                    kullanıcı tekrar hissettiği hareketi burada değiştirebilir.
                    Değişiklik otomatik olarak kalıcı tercihe kaydedilir. */}
                {selection.kind === "smart" && <button
                  type="button"
                  className={isSwapped ? "exercise-swap-btn active" : "exercise-swap-btn"}
                  aria-expanded={swapOpenFor === index}
                  onClick={() => setSwapOpenFor(swapOpenFor === index ? null : index)}
                ><RefreshCw size={12} />{isSwapped ? t.exerciseSwap.activeBadge : t.exerciseSwap.trigger}</button>}
              </div>
              <small>{movementArea(item.area, locale)} · {movementPrescription(item.sets, locale)} · {movementPrescription(item.rest, locale)}</small>
              {selection.kind === "smart" && justSwappedName === item.name && <small className="swap-confirm"><Check size={11} />{t.exerciseSwap.swapped(movementName(item))}</small>}
              <details className="how-to"><summary>{t.dashboard.howTo}</summary>
                <ol className="mini-steps"><li>{guide.start}</li><li>{movementInstructions(item, locale)}</li><li>{guide.finish}</li></ol>
              </details>
              {selection.kind === "smart" && swapOpenFor === index && <div className="swap-panel">
                <div className="swap-panel-head">
                  <div className="eyebrow">{t.exerciseSwap.title}</div>
                  <button type="button" className="swap-panel-close" aria-label={t.exerciseSwap.cancel} onClick={() => setSwapOpenFor(null)}><X size={15} /></button>
                </div>
                <p>{t.exerciseSwap.hint}</p>
                {isSwapped && <div className="swap-current">
                  <span>{t.exerciseSwap.currentlyLabel}</span>
                  <strong>{movementName(item)}</strong>
                  <button type="button" onClick={() => revertSwap(index)}>{t.exerciseSwap.revert}</button>
                </div>}
                {alternatives.length ? <div className="swap-options">{alternatives.map((option) => {
                  const isCurrent = option.name === item.name;
                  return <button type="button" key={option.name} className={isCurrent ? "selected" : ""} onClick={() => applySwap(index, option)}>
                    <span className="swap-option-icon" data-tone={option.tone}>{option.icon}</span>
                    <span className="swap-option-copy"><strong>{movementName(option)}</strong><small>{movementArea(option.area, locale)}</small></span>
                    {isCurrent && <Check size={14} />}
                  </button>;
                })}</div> : <p className="swap-empty">{t.exerciseSwap.empty}</p>}
              </div>}
            </div>
          </article>;
        })}</div>
        {selection.kind === "custom" && <button type="button" className="program-edit" onClick={() => setBuilderId(selection.id)}>{t.programs.editProgram}</button>}
        {/* AI'ın planı neden böyle kurduğu, akıllı programın kendi ekranında
            durur; genel antrenman sekmesinde bağlamsız kalıyordu. */}
        {selection.kind === "smart" && smartExtra}
      </> : <div className="library-empty"><strong>{t.programs.emptyTitle}</strong><p>{selection.kind === "smart" ? t.programs.smartEmptyBody : t.programs.emptyBody}</p></div>}
    </section>;
  }

  // --- Program seçimi ---
  const freeSlot = nextFreeSlot(customPrograms);
  return <section className="programs" id="ready-programs">
    {/* Spor ekleme buradan kalktı: artık kendi sekmesi olan "Aktivite
        günlüğü" sayfasında, bütün sporlar tek listede duruyor. */}
    {/* Hazır programlar: dar ekranda alt alta, geniş ekranda yan yana. Bir
        dönem üstlerinde sekme anahtarı vardı; anahtar da kartlar da aynı üç
        adı gösterdiği için ekranda aynı şey iki kez duruyordu. Başlık şeridi
        ("PROGRAMLAR" + "Seç, başla…") de kalktı: kartların kendisi zaten
        anlatıyor. */}
    <div className="program-panel">
      <article className="program-card program-panel-item">
        <OnboardingIcon name="condition" />
        <h3>{t.programs.smartTitle}</h3>
        <p>{smartFallback ? t.programs.smartFallbackBody : t.programs.smartBody}</p>
        <small>{progressLabel(programKey("smart"))}</small>
        <button type="button" disabled={!smartWorkouts.length} onClick={() => openSelection({ kind: "smart" })}>
          {smartWorkouts.length ? t.programs.open : t.programs.smartLocked} {smartWorkouts.length ? <span>→</span> : null}
        </button>
      </article>

      <article className="program-card program-panel-item">
        <OnboardingIcon name="strength" />
        <h3>{t.programs.fullBodyTitle}</h3>
        <p>{t.programs.fullBodyBody}</p>
        <small>{progressLabel(programKey("fullBody", place))}</small>
        <button type="button" onClick={() => openSelection({ kind: "fullBody", place })}>{t.programs.open} <span>→</span></button>
      </article>

      <article className="program-card program-panel-item">
        <OnboardingIcon name="muscle" />
        <h3>{t.programs.splitTitle}</h3>
        <p>{t.programs.splitBody}</p>
        {/* Sabit bölgeler: önce tek kaslar, sonra "üst vücut / arka vücut /
            itiş / çekiş" gibi birleşik gruplar. Ardından kullanıcının kendi
            kurduğu bölgeler ve bir "bölge oluştur" düğmesi gelir. */}
        <div className="program-regions">
          {BODY_REGIONS.map((region) => (
            <button type="button" key={region.id} className="equipment" onClick={() => openSelection({ kind: "split", place, regionId: region.id, regionName: regionLabel(region), areas: region.areas })}>{regionLabel(region)}</button>
          ))}
          {customRegions.map((region) => (
            <span className="program-region-custom" key={region.id}>
              <button type="button" className="equipment" onClick={() => openSelection({ kind: "split", place, regionId: region.id, regionName: region.name, areas: region.areas })}>{region.name}</button>
              <button type="button" className="program-region-remove" aria-label={t.programs.deleteRegion(region.name)} onClick={() => setStoredCustomRegions(removeCustomRegion(customRegions, region.id))}><X size={12} /></button>
            </span>
          ))}
          {customRegions.length < CUSTOM_REGION_LIMIT && <button type="button" className="equipment program-region-add" onClick={() => setRegionBuilderOpen(true)}><Plus size={12} />{t.programs.addRegion}</button>}
        </div>
      </article>
    </div>

    {/* Kendi programların: eskiden her zaman ÜÇ kart (çoğu boş) duruyordu.
        Artık yalnız kurulmuş programlar ve tek bir "yeni program" kartı
        görünür; sayı ihtiyaca göre artar, silindikçe azalır. */}
    <div className="program-cards program-custom-row">
      {customPrograms.map((program) => (
        <article className="program-card" key={program.id}>
          <OnboardingIcon name="health" />
          <h3>{program.name}</h3>
          <p>{t.programs.customCount(program.exercises.length)}</p>
          <small>{progressLabel(programKey("custom", undefined, program.id))}</small>
          <button type="button" onClick={() => openSelection({ kind: "custom", id: program.id })}>{t.programs.open} <span>→</span></button>
        </article>
      ))}
      {freeSlot && <article className="program-card program-card-empty" key={freeSlot}>
        <OnboardingIcon name="health" />
        <h3>{t.programs.createTitle}</h3>
        <p>{customPrograms.length ? t.programs.createMoreBody : t.programs.createBody}</p>
        <button type="button" onClick={() => setBuilderId(freeSlot)}>{t.programs.create} <span>+</span></button>
      </article>}
    </div>

    {onOpenLibrary && <button type="button" className="programs-library-row" onClick={onOpenLibrary}>
      <span><b>{t.nav.library}</b><i>{t.programs.libraryHint}</i></span>
      <span aria-hidden="true">→</span>
    </button>}

    {regionBuilderOpen && <RegionBuilder
      existing={customRegions}
      areaLabel={areaLabel}
      onCancel={() => setRegionBuilderOpen(false)}
      onSave={(region) => { setStoredCustomRegions(upsertCustomRegion(customRegions, region)); setRegionBuilderOpen(false); }}
    />}
  </section>;
}

/**
 * Özel bölge kurucusu: kullanıcı çalıştığı kas gruplarını kendi adlandırdığı
 * bir grupta toplar (ör. "İtiş günü" = göğüs + omuz + kol). Sabit bölgeler
 * kalır; bu onların yanına eklenir.
 */
function RegionBuilder({ existing, areaLabel, onSave, onCancel }: {
  existing: CustomRegion[];
  areaLabel: (area: string) => string;
  onSave: (region: CustomRegion) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  // Kimlik zamandan üretilir: aynı adı iki kez kullanmak serbest olmalı ama
  // kayıtlar birbirini ezmemeli. Render sırasında DEĞİL, kaydederken üretilir —
  // her yeniden render'da değişen bir kimlik kararsız veri demekti.
  const nextId = () => {
    const taken = new Set(existing.map((region) => region.id));
    let id = `region-${Date.now().toString(36)}`;
    while (taken.has(id)) id = `${id}x`;
    return id;
  };

  function toggleArea(area: string) {
    setAreas((current) => current.includes(area) ? current.filter((item) => item !== area) : [...current, area]);
  }

  return <div className="account-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="region-builder-title">
    <div className="account-delete-dialog region-builder">
      <h2 id="region-builder-title">{t.programs.regionBuilderTitle}</h2>
      <p>{t.programs.regionBuilderBody}</p>
      <label>{t.programs.regionNameLabel}
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t.programs.regionNamePlaceholder} maxLength={40} />
      </label>
      <div className="answer-grid region-area-grid">{TRAINING_AREAS.map((area) => {
        const chosen = areas.includes(area);
        return <button type="button" key={area} aria-pressed={chosen} className={chosen ? "answer selected" : "answer"} onClick={() => toggleArea(area)}>{areaLabel(area)}</button>;
      })}</div>
      <div>
        <button type="button" onClick={onCancel}>{t.programs.cancel}</button>
        <button type="button" className="primary-btn" disabled={!areas.length || !name.trim()} onClick={() => onSave({ id: nextId(), name: name.trim(), areas })}>{t.programs.saveRegion}</button>
      </div>
    </div>
  </div>;
}

/** Hareket kütüphanesinden seçerek kendi programını kurma ekranı. */
function CustomProgramBuilder({ slotId, initial, onSave, onCancel, onDelete }: {
  slotId: string;
  initial?: CustomProgram;
  onSave: (program: CustomProgram) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [name, setName] = useState(initial?.name ?? "");
  const [picked, setPicked] = useState<ProgramExercise[]>(initial?.exercises ?? []);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<string>("");
  const pickedNames = useMemo(() => new Set(picked.map((exercise) => exercise.name)), [picked]);
  const estimatedMinutes = estimateProgramMinutes(picked);

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return exerciseLibrary
      .filter((item) => (!area || item.area === area) && (!needle || `${item.name} ${item.english}`.toLocaleLowerCase("tr-TR").includes(needle)))
      .slice(0, 40);
  }, [query, area]);

  function toggle(exerciseName: string) {
    setPicked((current) => current.some((item) => item.name === exerciseName)
      ? current.filter((item) => item.name !== exerciseName)
      : current.length >= 12 ? current : [...current, { name: exerciseName, ...DEFAULT_PROGRAM_EXERCISE }]);
  }

  // Reçete düzenlemeleri tek yerden geçer: her biri sınırlarına çekilerek
  // yazılır, böylece kaydedilen veri her zaman geçerli olur.
  function updateExercise(index: number, patch: Partial<ProgramExercise>) {
    setPicked((current) => current.map((exercise, position) => {
      if (position !== index) return exercise;
      return normalizeProgramExercise({ ...exercise, ...patch }) ?? exercise;
    }));
  }

  function move(index: number, direction: -1 | 1) {
    setPicked((current) => moveProgramExercise(current, index, index + direction));
  }

  return <section className="programs" id="ready-programs">
    <div className="section-title"><div className="eyebrow">{t.programs.builderEyebrow}</div><button type="button" className="back-btn" onClick={onCancel}>{t.programs.backToPrograms}</button></div>
    <h2>{t.programs.builderTitle}</h2>

    <label className="textarea-label">{t.programs.nameLabel}
      <input className="program-name-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t.programs.namePlaceholder} maxLength={60} />
    </label>

    <div className="program-filters">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.programs.searchPlaceholder} aria-label={t.programs.searchPlaceholder} />
      <select value={area} onChange={(event) => setArea(event.target.value)} aria-label={t.programs.areaFilter}>
        <option value="">{t.programs.allAreas}</option>
        {[...new Set(exerciseLibrary.map((item) => item.area))].sort((a, b) => a.localeCompare(b, "tr")).map((value) => <option key={value} value={value}>{movementArea(value, locale)}</option>)}
      </select>
    </div>

    <p className="programs-note">{t.programs.pickedCount(picked.length)}</p>
    <div className="program-picker">{results.map((item) => {
      const selected = pickedNames.has(item.name);
      return <button type="button" key={item.name} aria-pressed={selected} className={selected ? "program-pick selected" : "program-pick"} onClick={() => toggle(item.name)}>
        <strong>{movementName(item)}</strong><small>{movementArea(item.area, locale)}</small>
      </button>;
    })}</div>

    {/* Seçilen her hareketin set/tekrar/dinlenme reçetesi programla birlikte
        kaydedilir; sıra da buradaki taşımayla belirlenir. */}
    {picked.length > 0 && <div className="program-prescription">
      <div className="program-prescription-head">
        <strong>{t.programs.prescriptionTitle}</strong>
        <span className="program-estimate">{t.programs.estimatedMinutes(estimatedMinutes)}</span>
      </div>
      <ol className="program-prescription-list">
        {picked.map((exercise, index) => <li key={exercise.name}>
          <div className="program-prescription-title">
            <b>{index + 1}. {movementName(exercise)}</b>
            <div className="program-prescription-order">
              <button type="button" aria-label={t.programs.moveUp} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
              <button type="button" aria-label={t.programs.moveDown} disabled={index === picked.length - 1} onClick={() => move(index, 1)}>↓</button>
              <button type="button" aria-label={t.programs.removeExercise} onClick={() => toggle(exercise.name)}>×</button>
            </div>
          </div>
          <div className="program-prescription-fields">
            <label>{t.programs.setsLabel}
              <input type="number" inputMode="numeric" min={PROGRAM_EXERCISE_LIMITS.sets.min} max={PROGRAM_EXERCISE_LIMITS.sets.max} value={exercise.sets} onChange={(event) => updateExercise(index, { sets: Number(event.target.value) })} />
            </label>
            <label>{t.programs.repsLabel}
              <input type="text" value={exercise.reps} maxLength={PROGRAM_EXERCISE_LIMITS.reps.maxLength} onChange={(event) => updateExercise(index, { reps: event.target.value })} />
            </label>
            <label>{t.programs.restLabel}
              <input type="number" inputMode="numeric" min={PROGRAM_EXERCISE_LIMITS.rest.min} max={PROGRAM_EXERCISE_LIMITS.rest.max} step={15} value={exercise.restSeconds} onChange={(event) => updateExercise(index, { restSeconds: Number(event.target.value) })} />
            </label>
            <button type="button" className={exercise.dropSet ? "program-dropset active" : "program-dropset"} aria-pressed={exercise.dropSet} title={t.programs.dropSetHint} onClick={() => updateExercise(index, { dropSet: !exercise.dropSet })}>
              {t.programs.dropSetLabel}
            </button>
          </div>
        </li>)}
      </ol>
    </div>}

    <div className="action-row">
      {onDelete && <button type="button" className="back-btn program-delete" onClick={onDelete}>{t.programs.deleteProgram}</button>}
      <button type="button" className="primary-btn" disabled={!picked.length} onClick={() => onSave({
        id: slotId,
        name: name.trim() || t.programs.customTitle,
        exercises: picked,
        updatedAt: new Date().toISOString(),
      })}>{t.programs.saveProgram} <span>→</span></button>
    </div>
  </section>;
}
