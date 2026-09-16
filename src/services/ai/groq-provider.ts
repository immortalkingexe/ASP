/**
 * Groq API Integration Provider (DEPRECATED & INACTIVE)
 * Groq is completely removed from the active provider and fallback chain.
 * Primary Provider: Google Gemini API (gemini-2.5-flash)
 * Fallback Provider: NVIDIA NIM (meta/llama-3.3-70b-instruct)
 */

export interface GroqCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" | "text" };
}

export class GroqProvider {
  /**
   * Groq is disabled in favor of NVIDIA NIM.
   */
  static isConfigured(): boolean {
    return false;
  }

  /**
   * Generate text completion using Groq LLM API (Disabled)
   */
  static async complete(
    _prompt: string,
    _systemPrompt: string = "You are an expert educational AI assistant.",
    _options: GroqCompletionOptions = {}
  ): Promise<string | null> {
    console.warn("GroqProvider is deprecated. NVIDIA NIM is the active AI provider.");
    return null;
  }

  /**
   * Extract JSON structure using Groq (Disabled)
   */
  static async completeJson<T>(
    _prompt: string,
    _systemPrompt: string = "You extract structured JSON metadata from text."
  ): Promise<T | null> {
    console.warn("GroqProvider is deprecated. NVIDIA NIM is the active AI provider.");
    return null;
  }
}

