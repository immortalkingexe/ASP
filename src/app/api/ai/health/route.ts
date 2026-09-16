import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { GeminiProvider } from "@/services/ai/gemini-provider";
import { NvidiaNimProvider } from "@/services/ai/nvidia-nim-provider";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    // Run health diagnostics for Gemini (Primary) and NVIDIA NIM (Fallback)
    const [geminiHealth, nvidiaHealth] = await Promise.all([
      GeminiProvider.checkHealth(),
      NvidiaNimProvider.checkHealth(),
    ]);

    const isAvailable = geminiHealth.chatCompletionAvailable || nvidiaHealth.chatCompletionAvailable;

    return NextResponse.json(
      {
        primaryProvider: geminiHealth,
        fallbackProvider: nvidiaHealth,
        activeProvider: geminiHealth.chatCompletionAvailable
          ? "gemini"
          : nvidiaHealth.chatCompletionAvailable
          ? "nvidia-nim"
          : "none",
        isHealthy: isAvailable,
      },
      { status: isAvailable ? 200 : 503 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Health check error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
