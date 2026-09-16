/**
 * Google Gemini API Integration Provider (Primary LLM Provider)
 * Utilizes Gemini's OpenAI-compatible endpoint with gemini-2.5-flash.
 *
 * Base URL: https://generativelanguage.googleapis.com/v1beta/openai/
 * Chat Endpoint: POST /chat/completions
 *
 * NEVER expose the API key to client-side code or browser logs.
 */

export interface GeminiCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" | "text" };
  timeoutMs?: number;
}

export interface GeminiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class GeminiProvider {
  /**
   * Get server-side Gemini API Key lazily.
   */
  public static getApiKey(): string | null {
    if (typeof window !== "undefined") {
      throw new Error("GEMINI_API_KEY must ONLY be accessed on the server side.");
    }
    return process.env.GEMINI_API_KEY || null;
  }

  /**
   * Get Base URL for Gemini OpenAI-compatible API lazily.
   */
  public static getBaseUrl(): string {
    return process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/";
  }

  /**
   * Get target model for Gemini lazily.
   */
  public static getModel(): string {
    return process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  /**
   * Check if Gemini API is configured on the server.
   */
  public static isConfigured(): boolean {
    return typeof window === "undefined" && Boolean(process.env.GEMINI_API_KEY);
  }

  /**
   * Server-side health diagnostic checking Gemini API key, model, and endpoint connectivity.
   */
  public static async checkHealth(): Promise<{
    provider: string;
    apiKeyConfigured: boolean;
    baseUrlConfigured: boolean;
    modelConfigured: boolean;
    modelName: string;
    modelAvailable: boolean;
    chatCompletionAvailable: boolean;
    errorDetails?: string;
  }> {
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl();
    const model = this.getModel();

    const result = {
      provider: "gemini",
      apiKeyConfigured: Boolean(apiKey),
      baseUrlConfigured: Boolean(baseUrl),
      modelConfigured: Boolean(model),
      modelName: model,
      modelAvailable: false,
      chatCompletionAvailable: false,
    };

    if (!apiKey) {
      return { ...result, errorDetails: "GEMINI_API_KEY is not configured" };
    }

    try {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
      const compRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });

      if (compRes.ok) {
        result.modelAvailable = true;
        result.chatCompletionAvailable = true;
      } else {
        const errText = await compRes.text();
        return {
          ...result,
          errorDetails: `HTTP ${compRes.status}: ${errText.substring(0, 150)}`,
        };
      }
    } catch (err: any) {
      return {
        ...result,
        errorDetails: err?.message || String(err),
      };
    }

    return result;
  }

  /**
   * Non-streaming completion request with timeout support.
   */
  public static async complete(
    prompt: string,
    systemPrompt: string = "You are an expert educational AI assistant.",
    options: GeminiCompletionOptions = {}
  ): Promise<string | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return null;
    }

    const baseUrl = this.getBaseUrl();
    const model = options.model || this.getModel();
    const temperature = options.temperature ?? 0.2;
    const maxTokens = options.maxTokens ?? 4096;
    const timeoutMs = options.timeoutMs ?? 18000;
    const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Gemini Provider] HTTP ${response.status} for model "${model}":`, errText);
        return null;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      return text ? text.trim() : null;
    } catch (err: any) {
      clearTimeout(timer);
      console.error(`[Gemini Provider Exception] (${err?.name || "FetchError"}):`, err?.message || err);
      return null;
    }
  }

  /**
   * Extract JSON structure using Gemini.
   */
  public static async completeJson<T>(
    prompt: string,
    systemPrompt: string = "You extract structured JSON metadata from text.",
    options: GeminiCompletionOptions = {}
  ): Promise<T | null> {
    const raw = await this.complete(prompt, systemPrompt, {
      responseFormat: { type: "json_object" },
      temperature: 0.1,
      maxTokens: 4096,
      ...options,
    });

    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      try {
        return JSON.parse(cleaned) as T;
      } catch {
        return null;
      }
    }
  }
}
