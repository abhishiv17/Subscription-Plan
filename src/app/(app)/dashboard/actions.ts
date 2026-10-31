"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { requireRole } from "@/lib/auth";

export async function runBilling() {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_billing");
  if (error) flash("/dashboard", "err", error.message);
  revalidatePath("/", "layout");
  const r = data as { invoices_created: number; subscriptions_closed: number };
  flash(
    "/dashboard",
    "ok",
    `Billing run complete: ${r.invoices_created} invoice(s) created, ${r.subscriptions_closed} subscription(s) auto-closed.`,
  );
}
