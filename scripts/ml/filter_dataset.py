#!/usr/bin/env python3
"""Öğretmen çıktılarını filtreler ve eğitim/doğrulama bölmelerini üretir.

Öğretmenin HER çıktısı kullanılmaz. Kötü bir örnek, öğrenciye yanlış davranışı
öğretir — özellikle "veri uydurma" davranışı bir kez öğrenilirse benchmark'ta
doğrudan E grubunu düşürür.

Elenen örnekler:
  · <facts> içinde olmayan kullanıcı-verisi görünümlü sayı üretenler
  · eksik veri senaryosunda eksikliği kabul etmeyenler
  · Türkçe olmayan / dil karışımı içerenler
  · çok kısa veya çok uzun olanlar
  · madde imli / markdown biçimli olanlar (koç yanıtı düz paragraf)
  · kullanıcının sevmediği şeyi öneren (tercih ihlali) olanlar
  · öğretmen notunu tekrarlayanlar
"""
import argparse, json, pathlib, random, re, unicodedata

# Kullanıcı verisi görünümlü sayılar: kalori/adım/kilo aralıkları. Koçluk
# tavsiyesindeki "30 dakika", "3 set" gibi küçük sayılar serbesttir.
DATA_LIKE = re.compile(r"\d[\d.,]*")
LATIN_TR = re.compile(r"^[\sA-Za-zÇĞİÖŞÜçğıöşü0-9.,;:!?%()\-–—'\"’“”/+&°]*$")
ADMIT = re.compile(r"(kayıtlı değil|kayıt yok|veri yok|bilgi yok|göremiyorum|girilmemiş|kaydetmemişsin|paylaşmadın|bulunmuyor|mevcut değil|elimde .* yok)", re.I)
# Gerçek madde listesi elenir; **kalın** vurgu yalnız TEMİZLENİR — yanıtın
# içeriği iyi olduğu hâlde biçim yüzünden veri kaybetmenin anlamı yok.
BULLET = re.compile(r"(^|\n)\s*[-*•]\s|(^|\n)\s*\d+\.\s")
GREETING = re.compile(r"^(merhaba|selam)[!,.]?\s*", re.I)
TEACHER_LEAK = re.compile(r"(ÖĞRETMEN NOTU|<facts>|<memory>|öğretmen notu)", re.I)


def numbers_in(value) -> set[float]:
    """facts içindeki tüm sayıları toplar (iç içe sözlük/dizi dahil)."""
    found = set()
    if isinstance(value, dict):
        for item in value.values():
            found |= numbers_in(item)
    elif isinstance(value, list):
        for item in value:
            found |= numbers_in(item)
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        found.add(round(float(value), 2))
    return found


def answer_numbers(text: str) -> list[float]:
    out = []
    for raw in DATA_LIKE.findall(text):
        cleaned = raw.rstrip(".,").replace(".", "").replace(",", ".") if raw.count(",") == 1 and raw.count(".") <= 1 else raw.rstrip(".,").replace(",", "")
        try:
            out.append(round(float(cleaned), 2))
        except ValueError:
            continue
    return out


# Bu aralıkların dışındaki sayılar tavsiye sayısıdır (set, tekrar, dakika).
def is_user_data_number(n: float) -> bool:
    return n >= 500 or (40 <= n <= 200 and n != int(n))


def turkish_ok(text: str) -> bool:
    """Latin dışı harf (Kiril/CJK/Hangul) varsa ele.

    Karakter beyaz listesi BİLEREK kullanılmıyor: ilk sürümde `*` veya nadir
    noktalama yüzünden tamamen geçerli Türkçe yanıtlar eleniyordu. Asıl sinyal
    alfabe karışımıdır — küçük modeller Türkçeden Çinceye/Korece'ye kayıyor.
    """
    for ch in text:
        if ch.isalpha() and "LATIN" not in unicodedata.name(ch, ""):
            return False
    return True



# Sorunun hangi veri alanını hedeflediğini anlar.
FIELD_WORDS = {
    "steps": ("adım",),
    "calories": ("kalori", "yedim", "yemek"),
    "weight": ("kilo", "tartı"),
    "workouts": ("antrenman", "spor yapt"),
    "protein": ("protein",),
}


def question_targets(question: str, missing: list[str]) -> bool:
    lowered = question.lower()
    return any(any(w in lowered for w in FIELD_WORDS.get(f, ())) for f in missing)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompts", default=".hedefit-ml/data/prompts.json")
    ap.add_argument("--raw", default=".hedefit-ml/data/teacher_raw.jsonl")
    ap.add_argument("--out-dir", default=".hedefit-ml/data")
    ap.add_argument("--min-words", type=int, default=25)
    ap.add_argument("--max-words", type=int, default=130)
    args = ap.parse_args()

    prompts = {p["id"]: p for p in json.loads(pathlib.Path(args.prompts).read_text())}
    rows = [json.loads(line) for line in pathlib.Path(args.raw).read_text().splitlines() if line.strip()]

    kept, stats = [], {}
    def drop(reason: str) -> None:
        stats[reason] = stats.get(reason, 0) + 1

    for row in rows:
        item = prompts.get(row["id"])
        if not item:
            drop("bilinmeyen_id"); continue
        answer = (row.get("answer") or "").strip()
        answer = answer.replace("**", "").replace("##", "")
        # Öğretmen neredeyse her yanıta "Merhaba!" ile başlıyor. Bu kalıbı
        # öğrenciye öğretmek, sohbetin her mesajında selam veren bir koç üretir.
        answer = GREETING.sub("", answer).strip()
        words = len(answer.split())

        if not answer: drop("boş"); continue
        if TEACHER_LEAK.search(answer): drop("öğretmen_notu_sızdı"); continue
        if words < args.min_words: drop("çok_kısa"); continue
        if words > args.max_words: drop("çok_uzun"); continue
        if BULLET.search(answer): drop("madde_imli"); continue
        if not turkish_ok(answer): drop("dil_karışımı"); continue

        allowed = numbers_in(item["facts"])
        invented = [n for n in answer_numbers(answer) if is_user_data_number(n) and not any(abs(n - a) < 0.051 for a in allowed)]
        if invented: drop("uydurma_sayı"); continue

        # Eksikliği kabul etme yalnız SORU o alanı sorduğunda beklenir.
        # "Adım verisi yok" senaryosunda kullanıcı antrenman soruyorsa koçun
        # adımdan söz etmemesi doğrudur; bunu elemek veriyi boşuna azaltırdı.
        missing = item["facts"].get("unavailable") or []
        if missing and question_targets(item["question"], missing) and not ADMIT.search(answer):
            drop("eksiklik_kabul_edilmedi"); continue

        disliked = [m["key"].lower() for m in (item.get("memories") or []) if m["value"] in ("dislike", "sakatlık")]
        if any(k in answer.lower() for k in disliked):
            drop("tercih_ihlali"); continue

        kept.append({"id": row["id"], "system": item["systemPrompt"], "user": item["question"],
                      "assistant": answer, "kind": item["kind"]})

    rng = random.Random(20260819)
    rng.shuffle(kept)
    split = max(1, int(len(kept) * 0.05))
    valid, train = kept[:split], kept[split:]

    out = pathlib.Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, rows_ in (("train", train), ("valid", valid)):
        with (out / f"{name}.jsonl").open("w") as sink:
            for row in rows_:
                sink.write(json.dumps({"messages": [
                    {"role": "system", "content": row["system"]},
                    {"role": "user", "content": row["user"]},
                    {"role": "assistant", "content": row["assistant"]},
                ]}, ensure_ascii=False) + "\n")

    total = len(rows)
    print(f"ham {total} · kabul {len(kept)} (%{100*len(kept)/max(1,total):.1f}) · eğitim {len(train)} · doğrulama {len(valid)}")
    print("elenme sebepleri:", dict(sorted(stats.items(), key=lambda kv: -kv[1])))
    from collections import Counter
    print("tür dağılımı:", dict(Counter(r["kind"] for r in kept)))


if __name__ == "__main__":
    main()
