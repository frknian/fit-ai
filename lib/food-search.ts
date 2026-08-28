const TURKISH_PROVIDER_TERMS: Array<[RegExp, string]> = [
  [/^tavuklu pilav$/i, "chicken and rice"],
  [/^etli pilav$/i, "beef and rice"],
  [/^mercimek [cç]orbası$/i, "lentil soup"],
  [/^ezogelin [cç]orbası$/i, "lentil soup"],
  [/^tavuk [cç]orbası$/i, "chicken soup"],
  [/^kuru fasulye$/i, "white beans cooked"],
  [/^nohut yemeği$/i, "chickpeas cooked"],
  [/^menemen$/i, "scrambled eggs with tomato"],
  [/^omlet$/i, "omelet"],
  [/^k[oö]fte$/i, "beef meatballs"],
  [/^(d[oö]ner|d[oö]ner kebap)$/i, "doner kebab"],
  [/^ızgara tavuk$/i, "grilled chicken"],
  [/^tavuk g[oö]ğs[uü]$/i, "chicken breast"],
  [/^tavuk$/i, "chicken"],
  [/^hindi$/i, "turkey"],
  [/^(dana eti|kırmızı et|et)$/i, "beef"],
  [/^kıyma$/i, "ground beef"],
  [/^balık$/i, "fish"],
  [/^somon$/i, "salmon"],
  [/^ton balığı$/i, "tuna"],
  [/^yumurta$/i, "egg"],
  [/^yumurta beyazı$/i, "egg white"],
  [/^s[uü]t$/i, "milk"],
  [/^yoğurt$/i, "yogurt"],
  [/^peynir$/i, "cheese"],
  [/^lor peyniri$/i, "cottage cheese"],
  [/^pirin[cç] pilavı$/i, "cooked rice"],
  [/^(pilav|pirin[cç])$/i, "rice"],
  [/^bulgur$/i, "bulgur"],
  [/^makarna$/i, "pasta"],
  [/^ekmek$/i, "bread"],
  [/^yulaf( ezmesi)?$/i, "oats"],
  [/^mercimek$/i, "lentils"],
  [/^nohut$/i, "chickpeas"],
  [/^fasulye$/i, "beans"],
  [/^patates$/i, "potato"],
  [/^elma$/i, "apple"],
  [/^muz$/i, "banana"],
  [/^portakal$/i, "orange"],
  [/^çilek$/i, "strawberries"],
  [/^badem$/i, "almonds"],
  [/^ceviz$/i, "walnuts"],
  [/^zeytinyağı$/i, "olive oil"],
];

export function foodSearchQueries(query: string): string[] {
  const clean = query.trim().replace(/\s+/g, " ").slice(0, 80);
  if (clean.length < 2) return [];
  const translated = TURKISH_PROVIDER_TERMS.find(([pattern]) => pattern.test(clean))?.[1];
  return translated && translated.toLocaleLowerCase("en-US") !== clean.toLocaleLowerCase("en-US")
    ? [clean, translated]
    : [clean];
}
