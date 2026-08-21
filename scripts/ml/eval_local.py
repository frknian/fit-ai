#!/usr/bin/env python3
"""Hedefit 48-senaryo kümesini bir HF modeliyle çalıştırır.

Bu betik KALİTE ölçer, performans değil: TTFT/token-sn/PSS yalnız gerçek
telefonda anlamlıdır. Amaç, eğitim döngüsünü cihaz beklemeden hızlı
döndürebilmek.

İstemler .benchmark/hedefit-benchmark-input.json içinden AYNEN alınır —
bunlar gerçek Hedefit boru hattının (Intelligence Engine + Memory + Context
Builder + Safety) ürettiği nihai istemlerdir. Burada yeniden üretmek ikinci bir
gerçek kaynağı yaratırdı.

Güvenlik katmanının engellediği senaryolar modele HİÇ gönderilmez; uygulamada
da öyle çalışır.
"""
import argparse, json, pathlib, time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = pathlib.Path(__file__).resolve().parents[2]
INPUT = ROOT / ".benchmark" / "hedefit-benchmark-input.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--max-new-tokens", type=int, default=320)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    scenarios = json.loads(INPUT.read_text())["scenarios"]
    if args.limit:
        scenarios = scenarios[: args.limit]

    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(
        args.model, dtype=torch.float32, device_map="mps" if torch.backends.mps.is_available() else "cpu"
    )
    model.eval()

    results = []
    for index, scenario in enumerate(scenarios, 1):
        if scenario.get("safetyBlocked"):
            # Güvenlik katmanı yanıtladı; model çağrılmaz.
            results.append({
                "id": scenario["id"], "group": scenario["group"],
                "text": scenario.get("safetyResponse") or "",
                "safetyHandled": True, "latencyMs": 0,
            })
            print(f"[{index}/{len(scenarios)}] {scenario['id']} (güvenlik)")
            continue

        messages = [
            {"role": "system", "content": scenario["systemPrompt"]},
            {"role": "user", "content": scenario["question"]},
        ]
        prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tok(prompt, return_tensors="pt").to(model.device)
        started = time.time()
        with torch.no_grad():
            output = model.generate(
                **inputs, max_new_tokens=args.max_new_tokens,
                do_sample=True, temperature=0.3, top_p=0.95, top_k=40,
                pad_token_id=tok.eos_token_id,
            )
        text = tok.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        elapsed = int((time.time() - started) * 1000)
        results.append({
            "id": scenario["id"], "group": scenario["group"], "text": text,
            "latencyMs": elapsed,
            "outputTokens": int(output.shape[1] - inputs["input_ids"].shape[1]),
        })
        print(f"[{index}/{len(scenarios)}] {scenario['id']} {elapsed}ms · {text[:70]!r}")

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"label": args.label, "model": args.model, "results": results}, ensure_ascii=False, indent=2))
    print("yazıldı:", out)


if __name__ == "__main__":
    main()
