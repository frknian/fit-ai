import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const app = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
const goalCard = await readFile(new URL("../components/GoalPlanCard.tsx", import.meta.url), "utf8");
const streak = await readFile(new URL("../components/ActivityStreak.tsx", import.meta.url), "utf8");
const training = await readFile(new URL("../components/TrainingPrograms.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("ana ekran mobil sayfalayıcı olmadan tek akışta durur", () => {
  // Ana ekran 4 ayrı kaydırmalı sayfaydı; içerik mini seri + kompakt hedef
  // planı + tek satırlık enerji özetiyle artık tek ekrana sığdığı için
  // sayfalama kaldırıldı.
  assert.doesNotMatch(app, /MobilePager/, "sayfalayıcı bileşeni kalmamalı");
  const homeStart = app.indexOf('className="dashboard-head"');
  assert.ok(homeStart > 0);
  const home = app.slice(homeStart, app.indexOf("</section>", homeStart));
  assert.match(home, /<ActivityStreak userId=\{authUser\.id\} compact \/>/, "mini seri selamlamanın yanında olmalı");
  assert.match(home, /<QuickActions onNavigate=\{navigateFromQuickAction\} \/>/);
  assert.match(home, /<GoalPlanCard compact bmi=\{bmi\} onOpen=\{\(\) => setGoalPlanOpen\(true\)\}/);
  assert.match(home, /className="home-top-row"/);
  assert.match(home, /<DailyEnergyRing compact userId=/, "kalori çemberi adım sayarla aynı satırda olmalı");
  assert.match(home, /<StepCounterCard userId=/, "adım sayar kalori çemberiyle aynı satırda olmalı");
  // "BUGÜNÜN PLANI" şeridi kaldırıldı: ekranın en üstünde artık selamlama var.
  assert.doesNotMatch(home, /t\.dashboard\.todaysPlan/, "bugünün planı başlığı kalkmalı");
  // Hedefit Rota giriş şeridi ana ekrandan kalktı; kendi sekmesinde ve kısayollarda.
  assert.doesNotMatch(home, /gps-activity-entry/, "Hedefit Rota şeridi ana ekranda olmamalı");
});

test("hedef planının tam hâli yalnız kaplamada, dokununca açılır", () => {
  // Kaplama durumu rota yığınından geliyor: geri tuşu onu kapatır, uygulamayı değil.
  assert.match(app, /const goalPlanOpen = overlayOpen\("goalPlan"\);/);
  assert.match(app, /\{goalPlanOpen && authUser && <div className="goal-plan-overlay"/);
  // Kaplamadaki kart compact DEĞİL: grafik, AI analizi ve sihirbaz orada tam görünür.
  const overlayStart = app.indexOf('className="goal-plan-overlay"');
  const overlay = app.slice(overlayStart, overlayStart + 600);
  assert.doesNotMatch(overlay, /<GoalPlanCard compact/, "kaplamadaki kart tam olmalı");
  assert.match(overlay, /<GoalPlanCard userId=\{authUser\.id\}/);
});

test("mini seri rozeti sadece alev ve sayı gösterir", () => {
  assert.match(streak, /compact = false/);
  assert.match(streak, /if \(compact\) return <span className="activity-streak-mini"/);
  assert.match(css, /\.activity-streak-mini \{/);
});

test("hedef planı kompakt şeridi hafta, kalan ve günlük hedefi yan yana gösterir", () => {
  assert.match(goalCard, /compact = false, onOpen/);
  assert.match(goalCard, /if \(compact\) \{/);
  const compactBlock = goalCard.slice(goalCard.indexOf("if (compact) {"), goalCard.indexOf("// --- Soru sihirbazı"));
  assert.match(compactBlock, /goal-plan-compact-stats/);
  assert.match(compactBlock, /t\.goalPlan\.compactDurationLabel/, "süre");
  assert.match(compactBlock, /t\.goalPlan\.compactRemainingLabel/, "kalan");
  assert.match(compactBlock, /t\.goalPlan\.compactIntakeLabel/, "günlük hedef");
  // Küçük eğri kompakt şeritte de var (kullanıcı planı ana ekranda grafikle
  // görmek istedi); AI analizi hâlâ yalnız kaplamada.
  assert.match(compactBlock, /goal-plan-chart goal-plan-chart-mini/);
  assert.doesNotMatch(compactBlock, /goal-plan-analysis/);
});

test("kalori çemberi ve adım sayar yan yana, kısayollar üç sütun ve kırpılmaz", () => {
  const topRow = css.match(/\.home-top-row \{([^}]*)\}/)?.[1] ?? "";
  assert.match(topRow, /display:grid/);
  assert.match(topRow, /grid-template-columns:repeat\(auto-fit/, "iki sütun; adım kartı yoksa tek çocuk genişler");
  // Stitch "Shortcuts Grid": iki sütun, her kutuda ikon + etiket yan yana.
  // (Üç sütunda ikon eklenince etiketler yeniden kırpılmaya başlıyordu.)
  assert.match(css, /\.quick-actions-list \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \}/);
  const button = css.match(/\.quick-actions-list button,\.quick-actions-picker button \{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(button, /text-overflow:ellipsis|white-space:nowrap/, "etiket kırpılmamalı, sarmalı");
  assert.match(button, /overflow-wrap:anywhere/);
  // Hedef ve ortam sütunları ana ekrandan kalktı.
  assert.doesNotMatch(app.slice(app.indexOf('className="dashboard-head"')), /t\.dashboard\.environmentLabel/);
});

test("VKİ ana ekranda değil, yalnız hedef planında yazar", () => {
  const homeStart = app.indexOf('className="dashboard-head"');
  const home = app.slice(homeStart, app.indexOf("</section>", homeStart));
  assert.doesNotMatch(home, /home-bmi/, "VKİ kutusu ana ekrandan kalkmalı");
  assert.match(home, /<GoalPlanCard compact bmi=\{bmi\}/, "VKİ hedef planına geçmeli");
  // Hedef planı henüz kurulmamışken de VKİ görünür, aksi halde hiç görünmezdi.
  assert.match(goalCard, /goal-plan-compact-bmi/);
  assert.match(goalCard, /t\.goalPlan\.compactBmiLabel/);
});

test("kalori çemberi hedeften düşer: alınan eksi, antrenman yakımı artı", () => {
  const ring = readFileSync(new URL("../components/DailyEnergyRing.tsx", import.meta.url), "utf8");
  assert.match(ring, /const budget = target === null \? null : target \+ burned;/);
  assert.match(ring, /const remaining = budget === null \? null : budget - consumed;/);
});

test("hazır programlar tek listede, kendi programların en altta", () => {
  // Sekme anahtarı kaldırıldı: anahtar da kartlar da aynı üç adı gösteriyordu,
  // mobilde aynı şey ekranda iki kez duruyordu.
  assert.doesNotMatch(training, /program-switch/, "anahtar kalmamalı");
  const panel = training.indexOf('className="program-panel"');
  const customRow = training.indexOf('className="program-cards program-custom-row"');
  assert.ok(panel > 0 && customRow > panel, "kendi programların en altta olmalı");
  // Üç kart da her zaman listede; dar ekranda alt alta, geniş ekranda yan yana.
  assert.equal(training.split('className="program-card program-panel-item"').length - 1, 3);
  // Akıllı Program tam genişlikte öne çıkan kart, diğer ikisi altında yan yana.
  assert.match(css, /@media \(min-width:860px\) \{ \.program-panel \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \} \.program-panel-item:first-child \{ grid-column:1 \/ -1; \} \}/);
  const panelBlock = training.slice(panel, customRow);
  assert.match(panelBlock, /t\.programs\.smartTitle/);
  assert.match(panelBlock, /t\.programs\.fullBodyTitle/);
  assert.match(panelBlock, /t\.programs\.splitTitle/);
  // Başlık şeridi ("PROGRAMLAR" + "Seç, başla…") liste ekranından kalktı.
  assert.doesNotMatch(panelBlock, /programs-hint/);
  assert.ok(!training.slice(panel).includes("t.programs.eyebrow"), "liste ekranında PROGRAMLAR başlığı kalmamalı");
  // Özel program kartlarının sayısı sabit değil (kurulan program + "yeni
  // program" kartı): sığdığı kadar yerleşen esnek ızgara.
  assert.match(css, /\.program-cards\.program-custom-row \{ grid-template-columns:repeat\(auto-fill,minmax\(220px,1fr\)\);/);
});
