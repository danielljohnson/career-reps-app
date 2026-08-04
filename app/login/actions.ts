"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface Credentials {
  email: string;
  password: string;
}

function getCredentials(formData: FormData): Credentials {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

// Builds an absolute origin from forwarded headers so the email confirmation
// link points back at whichever environment (local, preview, prod) sent it.
function getOrigin(): string {
  const requestHeaders = headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

export async function login(formData: FormData) {
  const { email, password } = getCredentials(formData);

  if (!email || !password) {
    redirect(
      `/login?error=${encodeURIComponent("Enter your email and password.")}`,
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const { email, password } = getCredentials(formData);

  if (!email || !password) {
    redirect(
      `/login?error=${encodeURIComponent("Enter your email and password.")}`,
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getOrigin()}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // A session comes back immediately only when email confirmation is off.
  // When it's on, there's no session yet; the user confirms via email first.
  if (data.session) {
    redirect("/dashboard");
  }

  redirect("/login?message=check-email");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

