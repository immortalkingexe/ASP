/**
 * Unified AI Provider Fallback Service
 * Coordinates Primary (Google Gemini) and Secondary/Fallback (NVIDIA NIM) LLM completions.
 *
 * Provider Flow:
 *   Gemini (Primary: gemini-2.5-flash)
 *     ↓ (on failure or unconfigured)
 *   NVIDIA NIM (Fallback: meta/llama-3.3-70b-instruct)
 *     ↓ (on failure)
 *   null / error handling
 *
 * Adheres strictly to security: API keys are NEVER logged or exposed to the client.
 */

import { GeminiProvider, GeminiCompletionOptions } from "./gemini-provider";
import { NvidiaNimProvider, NvidiaNimCompletionOptions } from "./nvidia-nim-provider";

export interface UnifiedCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface UnifiedCompletionResult<T = string> {
  result: T | null;
  provider: "gemini" | "nvidia-nim" | null;
  model: string | null;
}

export class AiFallbackService {
  /**
   * Execute non-streaming text completion with Gemini primary and NVIDIA NIM fallback.
   */
  public static async complete(
    prompt: string,
    systemPrompt: string = "You are an expert educational AI assistant.",
    options: UnifiedCompletionOptions = {}
  ): Promise<UnifiedCompletionResult<string>> {
    const geminiConfigured = GeminiProvider.isConfigured();
    const geminiModel = options.model || GeminiProvider.getModel();

    // 1. Attempt Primary Provider: Gemini
    if (geminiConfigured) {
      console.log("[LLM] Primary provider: gemini");
      console.log(`[LLM] Model: ${geminiModel}`);

      try {
        const geminiResult = await GeminiProvider.complete(prompt, systemPrompt, {
          ...options,
          model: geminiModel,
        });

        if (geminiResult) {
          return {
            result: geminiResult,
            provider: "gemini",
            model: geminiModel,
          };
        }
      } catch (err: any) {
        console.error("[LLM] Gemini completion error:", err?.message || err);
      }
    }

    // 2. Gemini failed or unconfigured -> Attempt NVIDIA NIM Fallback
    console.warn("[LLM] Gemini failed, attempting NVIDIA NIM fallback");

    const nvidiaConfigured = NvidiaNimProvider.isConfigured();
    const nvidiaModel = NvidiaNimProvider.getModel();

    if (nvidiaConfigured) {
      try {
        const nvidiaResult = await NvidiaNimProvider.complete(prompt, systemPrompt, {
          ...options,
          model: nvidiaModel,
        });

        if (nvidiaResult) {
          console.log("[LLM] Fallback provider: nvidia-nim");
          console.log(`[LLM] Model: ${nvidiaModel}`);
          return {
            result: nvidiaResult,
            provider: "nvidia-nim",
            model: nvidiaModel,
          };
        }
      } catch (err: any) {
        console.error("[LLM] NVIDIA NIM completion error:", err?.message || err);
      }
    }

    console.error("[LLM] Both AI providers failed or are not configured.");
    return {
      result: null,
      provider: null,
      model: null,
    };
  }

  /**
   * Execute structured JSON completion with Gemini primary and NVIDIA NIM fallback.
   */
  public static async completeJson<T>(
    prompt: string,
    systemPrompt: string = "You extract structured JSON metadata from text.",
    options: UnifiedCompletionOptions = {}
  ): Promise<UnifiedCompletionResult<T>> {
    const geminiConfigured = GeminiProvider.isConfigured();
    const geminiModel = options.model || GeminiProvider.getModel();

    // 1. Attempt Primary Provider: Gemini
    if (geminiConfigured) {
      console.log("[LLM] Primary provider: gemini");
      console.log(`[LLM] Model: ${geminiModel}`);

      try {
        const geminiResult = await GeminiProvider.completeJson<T>(prompt, systemPrompt, {
          ...options,
          model: geminiModel,
        });

        if (geminiResult) {
          return {
            result: geminiResult,
            provider: "gemini",
            model: geminiModel,
          };
        }
      } catch (err: any) {
        console.error("[LLM] Gemini JSON completion error:", err?.message || err);
      }
    }

    // 2. Gemini failed or unconfigured -> Attempt NVIDIA NIM Fallback
    console.warn("[LLM] Gemini failed, attempting NVIDIA NIM fallback");

    const nvidiaConfigured = NvidiaNimProvider.isConfigured();
    const nvidiaModel = NvidiaNimProvider.getModel();

    if (nvidiaConfigured) {
      try {
        const nvidiaResult = await NvidiaNimProvider.completeJson<T>(prompt, systemPrompt, {
          ...options,
          model: nvidiaModel,
        });

        if (nvidiaResult) {
          console.log("[LLM] Fallback provider: nvidia-nim");
          console.log(`[LLM] Model: ${nvidiaModel}`);
          return {
            result: nvidiaResult,
            provider: "nvidia-nim",
            model: nvidiaModel,
          };
        }
      } catch (err: any) {
        console.error("[LLM] NVIDIA NIM JSON completion error:", err?.message || err);
      }
    }

    console.error("[LLM] Both AI providers failed or are not configured for JSON extraction.");
    return {
      result: null,
      provider: null,
      model: null,
    };
  }
}
