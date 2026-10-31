"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { flash, optStr, str } from "@/lib/flash";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";
import { emailConfigured, portalInvoiceUrl, sendEmail } from "@/lib/email";
import { dateParam, escapeHtml, isPaymentMethod } from "@/lib/invoices";
import { hasTwoDecimals, UUID_RE } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";

function revalidateInvoice(invoiceId: string) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

export async function setInvoiceStatus(invoiceId: string, status: "confirmed" | "cancelled") {
  await requireRole("admin", "staff");
  if (!UUID_RE.test(invoiceId) || !["confirmed", "cancelled"].includes(status)) flash("/invoices", "err", "Invoice not found.");
  const supabase = await createClient();
  const back = `/invoices/${invoiceId}`;
  const { data, error } = await supabase.from("invoices").update({ status }).eq("id", invoiceId).select("id");
  if (error) flash(back, "err", error.message);
  if (!data?.length) flash(back, "err", "Invoice not found.");
  revalidateInvoice(invoiceId);
  flash(back, "ok", status === "confirmed" ? "Invoice confirmed. The customer can now see and pay it." : "Invoice cancelled.");
}

/** Confirms a draft if needed, marks the invoice as sent, and emails it when RESEND_API_KEY is set. */
export async function sendInvoice(invoiceId: string) {
  await requireRole("admin", "staff");
  if (!UUID_RE.test(invoiceId)) flash("/invoices", "err", "Invoice not found.");
  const supabase = await createClient();
  const back = `/invoices/${invoiceId}`;
  const { data: inv } = await supabase.from("invoice_overview").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv) flash("/invoices", "err", "Invoice not found.");
  if (inv.status === "cancelled") flash(back, "err", "A cancelled invoice cannot be sent.");
  if (inv.status === "draft") {
    const { error } = await supabase.from("invoices").update({ status: "confirmed" }).eq("id", invoiceId);
    if (error) flash(back, "err", error.message);
  }

  let delivered = false;
  if (emailConfigured()) {
    const link = portalInvoiceUrl(inv.id);
    const result = await sendEmail({
      to: inv.customer_email,
      subject: `Invoice ${inv.number} from Brightloop Software`,
      html: `<p>Hi ${escapeHtml(inv.customer_name)},</p>
<p>Your invoice <b>${escapeHtml(inv.number)}</b> for <b>${escapeHtml(fmtMoney(inv.total))}</b> is due on <b>${escapeHtml(fmtDate(inv.due_date))}</b>.</p>
<p>View and pay it in your portal: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
<p>Thank you,<br/>Brightloop Software</p>`,
    });
    if (!result.sent) flash(back, "err", `${result.error} The invoice was not marked as sent.`);
    delivered = true;
  }

  const { error } = await supabase.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", invoiceId);
  if (error) flash(back, "err", error.message);
  revalidateInvoice(invoiceId);
  flash(back, "ok", delivered ? `Invoice emailed to ${inv.customer_email}.` : `Invoice marked as sent to ${inv.customer_email}.`);
}

export async function recordPayment(invoiceId: string, form: FormData) {
  await requireRole("admin", "staff");
  if (!UUID_RE.test(invoiceId)) flash("/invoices", "err", "Invoice not found.");
  const supabase = await createClient();
  const back = `/invoices/${invoiceId}`;
  const amount = Number(str(form, "amount"));
  const method = str(form, "method");
  const rawDate = str(form, "payment_date");
  const paymentDate = rawDate ? dateParam(rawDate) : new Date().toISOString().slice(0, 10);
  const note = optStr(form, "note");
  if (!Number.isFinite(amount) || amount <= 0) flash(back, "err", "Enter an amount greater than zero.");
  if (!hasTwoDecimals(amount)) flash(back, "err", "Amounts can have at most two decimal places.");
  if (!isPaymentMethod(method)) flash(back, "err", "Choose a payment method.");
  if (!paymentDate) flash(back, "err", "Enter a valid payment date.");
  // One day of slack: the server runs on UTC while staff work in IST.
  if (paymentDate > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) flash(back, "err", "The payment date cannot be in the future.");
  if (note && note.length > 200) flash(back, "err", "Keep the note under 200 characters.");
  const { error } = await supabase.from("payments").insert({ invoice_id: invoiceId, method, amount, payment_date: paymentDate, note });
  if (error) flash(back, "err", error.message);
  revalidateInvoice(invoiceId);
  flash(back, "ok", `${titleCase(method)} payment of ${fmtMoney(amount)} recorded.`);
}

/** Admin only: removes a payment recorded by mistake. The invoice returns to confirmed if it is no longer fully paid. */
export async function deletePayment(invoiceId: string, paymentId: string) {
  await requireRole("admin");
  if (!UUID_RE.test(invoiceId) || !UUID_RE.test(paymentId)) flash("/invoices", "err", "Payment not found.");
  const supabase = await createClient();
  const back = `/invoices/${invoiceId}`;
  const { data, error } = await supabase.from("payments").delete().eq("id", paymentId).eq("invoice_id", invoiceId).select("amount");
  if (error) flash(back, "err", error.message);
  if (!data?.length) flash(back, "err", "Payment not found.");
  revalidateInvoice(invoiceId);
  flash(back, "ok", `Payment of ${fmtMoney(data[0].amount)} removed.`);
}
