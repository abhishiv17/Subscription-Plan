"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { flash, num, optStr, str } from "@/lib/flash";
import { fmtDate, fmtMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function setInvoiceStatus(invoiceId: string, status: "confirmed" | "cancelled") {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status }).eq("id", invoiceId);
  const back = `/invoices/${invoiceId}`;
  if (error) flash(back, "err", error.message);
  revalidatePath("/invoices");
  revalidatePath(back);
  flash(back, "ok", `Invoice ${status}.`);
}

/** Confirms the invoice if needed and emails it (via Resend when RESEND_API_KEY is set). */
export async function sendInvoice(invoiceId: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = `/invoices/${invoiceId}`;
  const { data: inv } = await supabase.from("invoice_overview").select("*").eq("id", invoiceId).single();
  if (!inv) flash("/invoices", "err", "Invoice not found.");
  if (inv.status === "cancelled") flash(back, "err", "A cancelled invoice cannot be sent.");
  if (inv.status === "draft") {
    const { error } = await supabase.from("invoices").update({ status: "confirmed" }).eq("id", invoiceId);
    if (error) flash(back, "err", error.message);
  }

  let delivered = false;
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.INVOICE_FROM_EMAIL ?? "Brightloop Billing <onboarding@resend.dev>",
        to: inv.customer_email,
        subject: `Invoice ${inv.number} from Brightloop Software`,
        html: `<p>Hi ${inv.customer_name},</p>
<p>Your invoice <b>${inv.number}</b> for <b>${fmtMoney(inv.total)}</b> is due on <b>${fmtDate(inv.due_date)}</b>.</p>
<p>View and pay it in your portal: <a href="${process.env.NEXT_PUBLIC_SITE_URL}/portal/invoices/${inv.id}">${process.env.NEXT_PUBLIC_SITE_URL}/portal/invoices/${inv.id}</a></p>
<p>Thank you,<br/>Brightloop Software</p>`,
      }),
    });
    delivered = res.ok;
  }

  await supabase.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", invoiceId);
  revalidatePath(back);
  flash(back, "ok", delivered ? `Invoice emailed to ${inv.customer_email}.` : `Invoice marked as sent to ${inv.customer_email}.`);
}

export async function recordPayment(invoiceId: string, form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = `/invoices/${invoiceId}`;
  const amount = num(form, "amount");
  if (amount <= 0) flash(back, "err", "Enter an amount greater than zero.");
  const { error } = await supabase.from("payments").insert({
    invoice_id: invoiceId,
    method: str(form, "method"),
    amount,
    payment_date: optStr(form, "payment_date") ?? undefined,
    note: optStr(form, "note"),
  });
  if (error) flash(back, "err", error.message);
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath(back);
  flash(back, "ok", `Payment of ${fmtMoney(amount)} recorded.`);
}
