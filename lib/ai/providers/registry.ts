// Sağlayıcı kaydı.
//
// Yeni bir sağlayıcı eklemek TEK satırdır:
//
//   providerRegistry.register(openAiProvider);
//
// Hedefit'in geri kalanında hiçbir dosya değişmez. Sıra önemlidir: router
// zinciri bu sırayla dener.

import { openAiCompatibleProvider } from "./openai-compatible.ts";
import type { AIProvider } from "../types.ts";

class ProviderRegistry {
  #providers: AIProvider[] = [];

  register(provider: AIProvider): this {
    // Aynı id iki kez kaydedilirse sonuncusu kazanır; testlerin sağlayıcıyı
    // sahtesiyle değiştirebilmesi için gerekli.
    this.#providers = [...this.#providers.filter((existing) => existing.id !== provider.id), provider];
    return this;
  }

  unregister(id: string): this {
    this.#providers = this.#providers.filter((provider) => provider.id !== id);
    return this;
  }

  get(id: string): AIProvider | undefined {
    return this.#providers.find((provider) => provider.id === id);
  }

  list(): AIProvider[] {
    return [...this.#providers];
  }

  reset(providers: AIProvider[] = DEFAULT_PROVIDERS): this {
    this.#providers = [...providers];
    return this;
  }
}

const DEFAULT_PROVIDERS: AIProvider[] = [openAiCompatibleProvider];

export const providerRegistry = new ProviderRegistry().reset();
