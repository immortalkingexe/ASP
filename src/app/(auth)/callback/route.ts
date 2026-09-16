import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { ProfilesService } from "@/services/db/profiles-service";

function getCallbackPublicOrigin(request: Request): string {
  // 1. Check explicit NEXT_PUBLIC_SITE_URL environment variable
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    const sanitized = process.env.NEXT_PUBLIC_SITE_URL.replace("0.0.0.0", "localhost").replace(/\/$/, "");
    if (sanitized) return sanitized;
  }

  // 2. Check request headers (x-forwarded-host, host) sent by Vercel or reverse proxy
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const cleanHost = host.replace("0.0.0.0", "localhost");
    const isLocal = cleanHost.includes("localhost") || cleanHost.includes("127.0.0.1");
    const proto = request.headers.get("x-forwarded-proto") || (isLocal ? "http" : "https");
    return `${proto}://${cleanHost}`.replace(/\/$/, "");
  }

  // 3. Automatic Vercel deployment URL environment variables
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL;
  if (vercelUrl) {
    const cleanVercel = vercelUrl.replace("0.0.0.0", "localhost").replace(/\/$/, "");
    return cleanVercel.startsWith("http") ? cleanVercel : `https://${cleanVercel}`;
  }

  // 4. Fallback from request.url replacing 0.0.0.0 with localhost
  try {
    const url = new URL(request.url);
    const cleanOrigin = url.origin.replace("0.0.0.0", "localhost");
    return cleanOrigin.replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const rawRedirectTo = searchParams.get("redirectTo") || "/dashboard";

  // Sanitize redirectTo to prevent open redirect vulnerabilities
  let redirectTo = "/dashboard";
  if (
    rawRedirectTo.startsWith("/") &&
    !rawRedirectTo.startsWith("//") &&
    !rawRedirectTo.includes(":\\")
  ) {
    redirectTo = rawRedirectTo;
  }

  const publicOrigin = getCallbackPublicOrigin(request);

  if (code) {
    const cookieStore = await cookies();
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    const cookiesToSetInResponse: Array<{ name: string; value: string; options: any }> = [];

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, { ...options, path: "/" });
            } catch {
              // Ignore errors if called during static generation
            }
            cookiesToSetInResponse.push({ name, value, options });
          });
        },
      },
    });

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[AUTH] exchangeCodeForSession failed:", error.message, error);
    } else {
      console.log("[AUTH] Code exchange succeeded, user ID:", data?.user?.id);
    }

    if (!error && data?.user) {
      // Ensure profile row exists in database for the newly authenticated OAuth user
      try {
        await ProfilesService.ensureProfile(
          data.user.id,
          data.user.email,
          data.user.user_metadata?.full_name || data.user.user_metadata?.name,
          supabase
        );
      } catch (profileErr) {
        console.error("[AuthCallback] Failed to ensure profile:", profileErr);
      }

      const response = NextResponse.redirect(`${publicOrigin}${redirectTo}`);

      // Explicitly attach all cookies updated by Supabase with full options and root path '/'
      cookiesToSetInResponse.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, {
          ...options,
          path: "/",
        });
      });

      // Fallback: Copy pre-existing cookies from cookieStore with root path '/'
      cookieStore.getAll().forEach((cookie) => {
        if (!cookiesToSetInResponse.some((c) => c.name === cookie.name)) {
          response.cookies.set(cookie.name, cookie.value, { path: "/" });
        }
      });

      return response;
    }
  }

  // Return user to login page if code exchange fails
  return NextResponse.redirect(`${publicOrigin}/login?error=auth_callback_failed`);
}


