"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { flash, str } from "@/lib/flash";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_RE, passwordError } from "@/lib/validation";

/** Only the admin can add a member of staff. */
export async function createStaff(form: FormData) {
  await requireRole("admin");
  const email = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  const fullName = str(form, "full_name");
  const role = str(form, "role") === "admin" ? "admin" : "staff";

  if (!fullName) flash("/users", "err", "Name is required.");
  if (!EMAIL_RE.test(email)) flash("/users", "err", "Enter a valid email address.");
  const pwErr = passwordError(password);
  if (pwErr) flash("/users", "err", pwErr);

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) flash("/users", "err", "An account with this email already exists.");

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName },
  });
  if (error) flash("/users", "err", error.message);

  // Belt and braces: make sure the profile carries the staff role and no customer record was attached.
  await admin.from("profiles").update({ role }).eq("id", data.user!.id);
  await admin.from("customers").delete().eq("user_id", data.user!.id);

  revalidatePath("/users");
  flash("/users", "ok", `${fullName} can now sign in as ${role}.`);
}
