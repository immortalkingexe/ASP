import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AiFallbackService } from "@/services/ai/ai-fallback-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate User
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
      return NextResponse.json({ error: "Unauthorized access." }, { status: 401 });
    }

    // 2. Parse & Validate Payload
    const body = await req.json();
    const { workspaceId, tasks, startDate } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId parameter is required" }, { status: 400 });
    }

    // Verify workspace access
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!ws) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    const baseDate = startDate || new Date().toISOString().split("T")[0];

    // Filter incomplete tasks
    const activeTasks = Array.isArray(tasks)
      ? tasks.filter((t: any) => !t.completed && t.status !== "completed")
      : [];

    if (activeTasks.length === 0) {
      return NextResponse.json({
        summary: "No active or incomplete tasks found. Add tasks to generate a study plan!",
        totalStudyMinutes: 0,
        sessions: [],
      });
    }

    // Construct AI Prompt
    const tasksSummary = activeTasks.map((t: any, i: number) => {
      return `${i + 1}. [${t.priority.toUpperCase()}] "${t.title}" (Subject: ${t.subject || "General"}, Due: ${t.dueDate || "No deadline"}, Est: ${t.estimatedMinutes || 45} mins)`;
    }).join("\n");

    const systemPrompt = `You are ASP AI Study Planner, an intelligent academic scheduler powered by NVIDIA NIM.
Analyze the student's task list, deadlines, and priorities, then generate an optimal 7-day study plan starting from date "${baseDate}".

PRIORITIZATION RULES:
1. Overdue tasks (due dates before "${baseDate}") MUST be scheduled first.
2. Urgent and High priority tasks MUST be scheduled before Low/Medium priority tasks.
3. Tasks with approaching deadlines MUST be scheduled before tasks without deadlines.
4. Keep daily study sessions reasonable (e.g. 45 to 90 minutes per session).
5. Use 24-hour time format for startTime and endTime (e.g. "18:00" to "19:00").

CRITICAL FORMAT REQUIREMENT:
You MUST return ONLY a valid JSON object matching this exact JSON schema:
{
  "summary": "Short paragraph explaining the strategy used for this study plan",
  "totalStudyMinutes": 180,
  "sessions": [
    {
      "title": "Study session title",
      "subject": "Subject name",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "durationMinutes": 60,
      "reasoning": "Reason why scheduled at this time"
    }
  ]
}

DO NOT include any markdown code blocks, backticks, or natural language text outside the raw JSON object.`;

    const userPrompt = `Student Task List:\n${tasksSummary}\n\nPlease generate the optimal study plan JSON.`;

    const { result: planData } = await AiFallbackService.completeJson<any>(
      userPrompt,
      systemPrompt,
      { maxTokens: 1500 }
    );

    if (!planData) {
      return NextResponse.json(
        { error: "Failed to generate AI study plan. Please verify API configuration." },
        { status: 502 }
      );
    }

    return NextResponse.json(planData);
  } catch (err: any) {
    console.error("[AI Study Plan Exception]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
