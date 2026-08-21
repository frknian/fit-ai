#!/usr/bin/env python3
"""Gemma 4 E2B (öğretmen) ile Hedefit distilasyon yanıtları üretir.

Öğretmene istem GERÇEK Hedefit yapısıyla verilir (system = Hedefit sistem
istemi, user = kullanıcı sorusu). Böylece öğrenci, üretimde göreceği bağlamın
aynısına karşılık gelen yanıtları öğrenir.

DÜŞÜNME KANALI: Gemma 4 yanıttan önce `<|channel>thought … <channel|>` bloğu
üretir. Bu blok bilinçli olarak TAMAMLANMASINA izin verilir (kesmek yanıtı da
kesiyordu) ve sonra atılır — eğitim verisine yalnız son yanıt girer.

Çıktı ham haldedir; filtreleme ayrı adımdadır (filter_dataset.py), böylece
filtre ölçütü değişince yeniden üretim gerekmez. Betik devam ettirilebilir.
"""
import argparse, json, pathlib, re, time

from mlx_lm import batch_generate, load
from mlx_lm.sample_utils import make_sampler

# Düşünme bloğunu kapatan işaret; sonrasındaki metin asıl yanıttır.
_CHANNEL_END = re.compile(r"<channel\|>")
_MARKERS = re.compile(r"<\|?[a-z_]+\|?>")


def extract_answer(raw: str) -> str:
    parts = _CHANNEL_END.split(raw)
    text = parts[-1] if len(parts) > 1 else raw
    return _MARKERS.sub("", text).strip()



# Eksik veri senaryolarında öğretmene EK vurgu.
#
# Ölçüldü: Gemma, verisi olmayan alanı uydurmuyor ama eksikliği AÇIKÇA da
# söylemiyor; konuyu dolaylı biçimde değiştiriyor ("vücudunu dinle"). Hedefit'in
# istediği davranış ise net: "bu veri kayıtlı değil, girersen değerlendiririm".
# Bu ek yalnız ÖĞRETMENE verilir; öğrencinin eğitim verisindeki system alanı
# gerçek Hedefit istemidir (bkz. filter_dataset.py).
def missing_hint(item: dict) -> str:
    missing = (item.get("facts") or {}).get("unavailable")
    if not missing:
        return ""
    return (
        "\n\nÖNEMLİ: Şu veriler kayıtlı DEĞİL: " + ", ".join(missing) + ". "
        "Yanıtında bu verinin kayıtlı olmadığını AÇIKÇA söyle ve kullanıcıdan "
        "girmesini iste. Bu alanlar için sayı tahmin etme, varsayma."
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=".hedefit-ml/base/gemma-4-e2b-mlx")
    ap.add_argument("--prompts", default=".hedefit-ml/data/prompts.json")
    ap.add_argument("--out", default=".hedefit-ml/data/teacher_raw.jsonl")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-tokens", type=int, default=700)
    ap.add_argument("--batch", type=int, default=24)
    args = ap.parse_args()

    prompts = json.loads(pathlib.Path(args.prompts).read_text())
    if args.limit:
        prompts = prompts[: args.limit]

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if out_path.exists():
        for line in out_path.read_text().splitlines():
            try:
                done.add(json.loads(line)["id"])
            except Exception:
                pass
    todo = [p for p in prompts if p["id"] not in done]
    print(f"toplam {len(prompts)} · tamamlanan {len(done)} · kalan {len(todo)}", flush=True)
    if not todo:
        return

    model, tokenizer = load(args.model)
    sampler = make_sampler(temp=0.6, top_p=0.95)

    started = time.time()
    with out_path.open("a") as sink:
        for offset in range(0, len(todo), args.batch):
            chunk = todo[offset : offset + args.batch]
            ids = [
                tokenizer.apply_chat_template(
                    [
                        {"role": "system", "content": item["systemPrompt"] + missing_hint(item)},
                        {"role": "user", "content": item["question"]},
                    ],
                    tokenize=True,
                    add_generation_prompt=True,
                )
                for item in chunk
            ]
            responses = batch_generate(
                model, tokenizer, prompts=ids, max_tokens=args.max_tokens,
                sampler=sampler, verbose=False,
            )
            for item, raw in zip(chunk, responses.texts):
                sink.write(json.dumps({"id": item["id"], "answer": extract_answer(raw)},
                                      ensure_ascii=False) + "\n")
            sink.flush()
            processed = offset + len(chunk)
            rate = processed / max(1e-6, time.time() - started)
            print(f"  {processed}/{len(todo)} · {rate:.2f} örnek/sn · kalan ~{(len(todo)-processed)/max(1e-6,rate)/60:.0f} dk", flush=True)


if __name__ == "__main__":
    main()
