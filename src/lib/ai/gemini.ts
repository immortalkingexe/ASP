/**
 * Server-Side Gemini Client / Service Wrapper
 * Re-exports GeminiProvider from services/ai for unified access.
 *
 * DO NOT import or execute in browser / client-side components.
 */

export { GeminiProvider } from "@/services/ai/gemini-provider";
export type { GeminiCompletionOptions, GeminiMessage } from "@/services/ai/gemini-provider";
