"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { flash, optStr, str } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_RE } from "@/lib/validation";

export async function saveCustomer(id: string | null, form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = id ? `/customers/${id}` : "/customers/new";
  const email = str(form, "email").toLowerCase();
  if (!str(form, "name")) flash(back, "err", "Name is required.");
  if (!EMAIL_RE.test(email)) flash(back, "err", "Enter a valid email address.");

  const values = { name: str(form, "name"), email, company: optStr(form, "company"), phone: optStr(form, "phone"), address: optStr(form, "address") };
  const { data, error } = id
    ? await supabase.from("customers").update(values).eq("id", id).select("id").single()
    : await supabase.from("customers").insert(values).select("id").single();
  if (error) flash(back, "err", error.code === "23505" ? "A customer with this email already exists." : error.message);
  revalidatePath("/customers");
  redirect(`/customers/${data.id}?ok=${encodeURIComponent("Customer saved.")}`);
}
