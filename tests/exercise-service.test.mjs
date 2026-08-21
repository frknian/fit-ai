import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { filterExercises, getAllExercises, getExerciseById, getExerciseFilterOptions, getExercisesByEquipment, getExercisesByLevel, getExercisesByMuscle, getExercisesForAI, searchExercises } from "../lib/exercise-service.ts";
import { nextFrameIndex, shouldCycleFrames } from "../lib/exercise-animation.ts";
import { trustedExerciseMedia } from "../lib/trusted-exercise-media.ts";

test("egzersiz veri seti normalize edilerek yüklenir", () => {
  const exercises = getAllExercises();
  assert.ok(exercises.length >= 100);
  assert.ok(exercises.every((exercise) => exercise.id && exercise.name && exercise.primaryMuscles.length && exercise.images.length >= 1));
});

test("egzersiz adı büyük-küçük harf duyarsız aranır", () => {
  const matches = searchExercises("PRESS");
  assert.ok(matches.length > 0);
  assert.ok(matches.every((exercise) => `${exercise.name} ${exercise.primaryMuscles.join(" ")} ${exercise.secondaryMuscles.join(" ")} ${exercise.equipment}`.toLowerCase().includes("press")));
});

test("kas ve ekipman adları Türkçe aranabilir", () => {
  assert.ok(searchExercises("göğüs").length > 0);
  assert.ok(searchExercises("dambıl").length > 0);
});

test("kas grubu, ekipman ve seviye filtreleri ayrı ayrı çalışır", () => {
  assert.ok(getExercisesByMuscle("chest").every((exercise) => [...exercise.primaryMuscles, ...exercise.secondaryMuscles].includes("chest")));
  assert.ok(getExercisesByEquipment("dumbbell").every((exercise) => exercise.equipment === "dumbbell"));
  assert.ok(getExercisesByLevel("beginner").every((exercise) => exercise.level === "beginner"));
});

test("birleşik filtreler aynı anda uygulanır", () => {
  const matches = filterExercises({ muscle: "biceps", equipment: "dumbbell", level: "beginner" });
  assert.ok(matches.length > 0);
  assert.ok(matches.every((exercise) => [...exercise.primaryMuscles, ...exercise.secondaryMuscles].includes("biceps") && exercise.equipment === "dumbbell" && exercise.level === "beginner"));
});

test("geçersiz egzersiz kimliği güvenli biçimde reddedilir", () => {
  assert.equal(getExerciseById("../../etc/passwd"), null);
  assert.equal(getExerciseById("olmayan-egzersiz"), null);
});

test("AI bağlamı yalnızca gerekli alanları içerir", () => {
  const [context] = getExercisesForAI({ muscle: "chest" });
  // secondaryMuscles ve category çıkarıldı: istemin ~%40'ını yiyorlardı ve
  // model seçim yaparken kullanmıyordu (bkz. lib/exercise-service.ts).
  assert.deepEqual(Object.keys(context).sort(), ["equipment", "id", "level", "name", "primaryMuscles"].sort());
  assert.equal("images" in context, false);
  assert.equal("instructions" in context, false);
});

test("tek görselde timer kurulmaz, çok görselde kare değişir", () => {
  assert.equal(shouldCycleFrames(1, true, true, false), false);
  assert.equal(shouldCycleFrames(2, true, true, false), true);
  assert.equal(shouldCycleFrames(2, false, true, false), false);
  assert.equal(shouldCycleFrames(2, true, false, false), false);
  assert.equal(shouldCycleFrames(2, true, true, true), false);
  assert.equal(nextFrameIndex(0, 2), 1);
  assert.equal(nextFrameIndex(1, 2), 0);
});

test("animasyon görünürlük, fallback ve timer temizliğini uygular", async () => {
  const source = await readFile(new URL("../components/exercises/ExerciseAnimation.tsx", import.meta.url), "utf8");
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /clearInterval\(timer\)/);
  assert.match(source, /Egzersiz görseli bulunamadı/);
  assert.match(source, /loading="lazy"/);
});

test("crunch ve reverse crunch için lisanslı yerel gerçek hareket karelerini kullanır", () => {
  assert.deepEqual(trustedExerciseMedia("Crunch"), ["/exercise-images/Crunches/0.jpg", "/exercise-images/Crunches/1.jpg"]);
  assert.deepEqual(trustedExerciseMedia("Bicycle Crunch"), ["/exercise-images/Cross-Body_Crunch/0.jpg", "/exercise-images/Cross-Body_Crunch/1.jpg"]);
  assert.deepEqual(trustedExerciseMedia("Reverse Crunch"), ["/exercise-images/Reverse_Crunch/0.jpg", "/exercise-images/Reverse_Crunch/1.jpg"]);
});

test("uygulama kataloğundaki tüm hareketler iki yerel animasyon karesine sahiptir", async () => {
  const page = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
  const core = page.slice(page.indexOf("const coreExerciseLibrary"), page.indexOf("const additionalExerciseDefinitions"));
  const additional = page.slice(page.indexOf("const additionalExerciseDefinitions"), page.indexOf("const additionalExerciseLibrary"));
  const exercises = [];
  for (const match of core.matchAll(/\{\s*name:\s*"([^"]+)",\s*english:\s*"([^"]+)"/g)) exercises.push([match[1], match[2]]);
  for (const match of additional.matchAll(/^\s*\["([^"]+)",\s*"([^"]+)"/gm)) exercises.push([match[1], match[2]]);

  // 181 idi: aynı hareketin iki kez geçtiği sekiz kayıt tek kayda indirildi.
  assert.equal(exercises.length, 173);
  for (const [name, english] of exercises) {
    const images = trustedExerciseMedia(name);
    assert.equal(images.length, 2, `${name} için iki hareket karesi bulunmalı`);
    assert.equal(trustedExerciseMedia(english).length, 2, `${english} için iki hareket karesi bulunmalı`);
    await Promise.all(images.map(async (image) => {
      const url = new URL(`../public${image}`, import.meta.url);
      await access(url);
      const file = await readFile(url);
      assert.ok(file.length > 1_000, `${name} hareket karesi boş veya bozuk olmamalı`);
      assert.deepEqual([...file.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name} hareket karesi geçerli JPEG olmalı`);
    }));
  }

  const report = JSON.parse(await readFile(new URL("../data/plan-exercise-media-report.json", import.meta.url), "utf8"));
  assert.equal(report.mappedExerciseCount, exercises.length);
  assert.deepEqual(report.missing, []);
});

test("hareket medyası mobil ve koyu tema için güvenli görünüm kurallarına sahiptir", async () => {
  const [styles, animation] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../components/exercises/ExerciseAnimation.tsx", import.meta.url), "utf8"),
  ]);
  await Promise.all(trustedExerciseMedia("Crunch").concat(trustedExerciseMedia("Bicycle Crunch"), trustedExerciseMedia("Reverse Crunch")).map((image) => access(new URL(`../public${image}`, import.meta.url))));
  assert.match(animation, /sizes=\{compact/);
  assert.match(animation, /unoptimized/);
  assert.match(animation, /onError/);
  assert.match(styles, /\.dark \.db-exercise-animation \{ background/);
  assert.match(styles, /\.dark \.db-exercise-animation img \{ mix-blend-mode:normal/);
  assert.match(styles, /\.workout-card > \.db-exercise-animation\.compact \{ flex:0 0 128px/);
});

test("kas grubu seçilince yalnızca verisi olan filtre seçenekleri kalır", () => {
  const all = getExerciseFilterOptions();
  const chest = getExerciseFilterOptions({ muscle: "chest" });
  // Kas grubu daraltıldığında seçenek listesi de daralmalı.
  assert.ok(chest.equipment.length < all.equipment.length);
  // Sunulan hiçbir seçenek boş sonuç vermemeli.
  for (const muscle of ["chest", "abdominals", "calves", "quadriceps"]) {
    const options = getExerciseFilterOptions({ muscle });
    for (const equipment of options.equipment) assert.ok(filterExercises({ muscle, equipment }).length > 0, `${muscle} + ${equipment} boş döndü`);
    for (const level of options.levels) assert.ok(filterExercises({ muscle, level }).length > 0, `${muscle} + ${level} boş döndü`);
    for (const category of options.categories) assert.ok(filterExercises({ muscle, category }).length > 0, `${muscle} + ${category} boş döndü`);
  }
  // Seçili kasın kendisi kendi listesinden düşmemeli.
  assert.ok(chest.muscles.includes("chest"));
});
