"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { flash, str } from "@/lib/flash";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_RE } from "@/lib/validation";

export async function changeRole(id: string, form: FormData) {
  const actor = await requireRole("admin");
  const role = str(form, "role");
  if (!["admin", "staff", "customer"].includes(role)) flash("/users", "err", "Choose a valid role.");
  if (id === actor.id) flash("/users", "err", "Ask another admin to change your own role.");
  const admin = createAdminClient();
  const { error } = await admin.rpc("set_account_role", { p_actor: actor.id, p_profile: id, p_role: role });
  if (error) flash("/users", "err", error.message);
  revalidatePath("/users");
  revalidatePath("/customers", "layout");
  flash("/users", "ok", "Account role updated.");
}

export async function inviteStaff(form: FormData) {
  const actor = await requireRole("admin");
  const email = str(form, "email").toLowerCase();
  const fullName = str(form, "full_name");
  const role = str(form, "role");
  if (!fullName) flash("/users", "err", "Name is required.");
  if (!EMAIL_RE.test(email)) flash("/users", "err", "Enter a valid email address.");
  if (!["admin", "staff"].includes(role)) flash("/users", "err", "Choose a team role.");
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) flash("/users", "err", "Set NEXT_PUBLIC_SITE_URL before sending invitations.");
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (lookupError) flash("/users", "err", lookupError.message);
  if (existing) flash("/users", "err", "This account already exists. Change its role in the list instead.");
  // Check migration availability before sending an email with an external side effect.
  const { error: readinessError } = await admin.rpc("set_account_role", { p_actor: actor.id, p_profile: actor.id, p_role: "admin" });
  if (readinessError) flash("/users", "err", `Invitation not sent: ${readinessError.message}`);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${site.replace(/\/$/, "")}/accept-invite`,
    data: { full_name: fullName },
  });
  if (error) flash("/users", "err", error.message);
  const { error: roleError } = await admin.rpc("set_account_role", { p_actor: actor.id, p_profile: data.user.id, p_role: role });
  revalidatePath("/users");
  revalidatePath("/customers");
  if (roleError) flash("/users", "err", `Invitation sent, but team access could not be assigned: ${roleError.message}. Find the account and change its role.`);
  flash("/users", "ok", `Invitation sent to ${email}. They can follow the email link to set their password.`);
}
