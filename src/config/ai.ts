/**
 * AI Integration Configuration
 * Primary Provider: Google Gemini (OpenAI-compatible endpoint)
 * Fallback Provider: NVIDIA NIM Hosted API
 */

export const aiConfig = {
  primaryProvider: "gemini" as const,
  fallbackProvider: "nvidia-nim" as const,
  provider: "gemini" as const,
  baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  gemini: {
    baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  nvidia: {
    baseUrl: process.env.NVIDIA_BASE_URL || process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
    model: process.env.NVIDIA_MODEL || process.env.NVIDIA_NIM_MODEL || "meta/llama-3.3-70b-instruct",
  },
  temperature: 0.7,
  maxTokens: 4096,
  embeddingModel: "text-embedding-3-small",
  ragChunkSize: 1000,
  ragChunkOverlap: 200,
  systemPrompts: {
    tutor: "You are ASP AI, a patient and intelligent academic study assistant. Help students synthesize information, summarize documents, create flashcards, and solve academic challenges.",
    summarizer: "You are a concise document summarizer. Extract key concepts, actionable bullet points, and core definitions.",
    quizGenerator: "You are an expert exam author. Create multiple-choice and short-answer practice questions testing deep conceptual understanding.",
  },
  status: "configured_active",
};
