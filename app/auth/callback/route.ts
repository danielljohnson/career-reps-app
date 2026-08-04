import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after a user clicks their email confirmation link,
// with a PKCE `code` to exchange for a real session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  const message = "That confirmation link is invalid or has expired.";
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(message)}`,
  );
}

