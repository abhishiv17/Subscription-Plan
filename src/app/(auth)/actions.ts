"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { homeFor, type Role } from "@/lib/auth";
import { EMAIL_RE, passwordError } from "@/lib/validation";

export type FormState = { error?: string; success?: string } | undefined;

async function siteUrl() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? h.get("origin") ?? `http://${h.get("host")}`;
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const fullName = String(form.get("full_name") ?? "").trim();
  const company = String(form.get("company") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!fullName) return { error: "Please enter your name." };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
  const pwErr = passwordError(password);
  if (pwErr) return { error: pwErr };
  if (password !== confirm) return { error: "Passwords do not match." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return { error: "An account with this email already exists. Try signing in instead." };

  // Self sign-up always creates a customer; staff are created by the admin only.
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, company },
  });
  if (error) {
    return { error: /already/i.test(error.message) ? "An account with this email already exists." : error.message };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: signInError.message };
  redirect("/portal");
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  redirect(homeFor((profile?.role as Role) ?? "customer"));
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: error.message };
  // Same message whether or not the account exists, so emails can't be probed.
  return { success: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const pwErr = passwordError(password);
  if (pwErr) return { error: pwErr };
  if (password !== confirm) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { success: "Password updated. You can now continue." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
