import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, portalInvoiceUrl, sendEmail } from "@/lib/email";
import { fmtDate, fmtMoney } from "@/lib/format";
import { escapeHtml } from "@/lib/invoices";

export const MAX_REMINDERS = 3;
export const REMINDER_GAP_DAYS = 7;
const DEFAULT_BATCH = 50;

export type ReminderRun = {
  mode: "send" | "dry-run";
  reason?: string;
  candidates: number;
  sent: string[];
  failed: { number: string; error: string }[];
  preview: { number: string; customer_email: string; amount_due: number; days_overdue: number; reminder: number }[];
};

type Candidate = {
  id: string; number: string; customer_name: string; customer_email: string;
  due_date: string; amount_due: number; reminder_count: number; last_reminder_at: string | null;
};

const daysBetween = (from: string, to: Date) => Math.floor((to.getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

export function reminderEmail(inv: Candidate, now = new Date()) {
  const days = daysBetween(inv.due_date, now);
  const link = portalInvoiceUrl(inv.id);
  return {
    subject: `Reminder: invoice ${inv.number} is overdue`,
    html: `<p>Hi ${escapeHtml(inv.customer_name)},</p>
<p>Invoice <b>${escapeHtml(inv.number)}</b> was due on <b>${escapeHtml(fmtDate(inv.due_date))}</b> (${days} day${days === 1 ? "" : "s"} ago).
<b>${escapeHtml(fmtMoney(inv.amount_due))}</b> is still outstanding.</p>
<p>You can pay it in your portal: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
<p>If you've already paid, please ignore this message.<br/>Brightloop Software</p>`,
  };
}

/**
 * Emails customers about overdue invoices: at most once every 7 days and 3 times per invoice.
 * Sends only when REMINDERS_ENABLED=true and email is configured; otherwise reports what it would send.
 * Each invoice is claimed with a conditional update before emailing, so overlapping runs never double-send.
 */
export async function runOverdueReminders(db: SupabaseClient, { dryRun = false, now = new Date() } = {}): Promise<ReminderRun> {
  const enabled = process.env.REMINDERS_ENABLED === "true";
  const mode: ReminderRun["mode"] = !dryRun && enabled && emailConfigured() ? "send" : "dry-run";
  const reason = mode === "send" ? undefined : dryRun ? "dry run requested" : !enabled ? "REMINDERS_ENABLED is not true" : "RESEND_API_KEY is not set";
  const batch = Math.max(1, Math.min(500, Number(process.env.REMINDER_BATCH) || DEFAULT_BATCH));
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - REMINDER_GAP_DAYS * 86_400_000).toISOString();

  const { data, count, error } = await db
    .from("invoice_overview")
    .select("id, number, customer_name, customer_email, due_date, amount_due, reminder_count, last_reminder_at", { count: "exact" })
    .eq("status", "confirmed")
    .lt("due_date", today)
    .lt("reminder_count", MAX_REMINDERS)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoff}`)
    .order("due_date")
    .order("id")
    .limit(batch);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Candidate[];
  const run: ReminderRun = { mode, reason, candidates: count ?? rows.length, sent: [], failed: [], preview: [] };

  for (const inv of rows) {
    run.preview.push({ number: inv.number, customer_email: inv.customer_email, amount_due: Number(inv.amount_due), days_overdue: daysBetween(inv.due_date, now), reminder: inv.reminder_count + 1 });
    if (mode !== "send") continue;

    // Claim: only succeeds if no other run has reminded this invoice since we read it.
    let claim = db.from("invoices")
      .update({ reminder_count: inv.reminder_count + 1, last_reminder_at: now.toISOString() })
      .eq("id", inv.id).eq("status", "confirmed").eq("reminder_count", inv.reminder_count);
    claim = inv.last_reminder_at ? claim.eq("last_reminder_at", inv.last_reminder_at) : claim.is("last_reminder_at", null);
    const { data: claimed, error: claimError } = await claim.select("id");
    if (claimError) { run.failed.push({ number: inv.number, error: claimError.message }); continue; }
    if (!claimed?.length) continue;

    const result = await sendEmail({ to: inv.customer_email, ...reminderEmail(inv, now) });
    if (result.sent) { run.sent.push(inv.number); continue; }
    // Release the claim so the next run retries.
    await db.from("invoices").update({ reminder_count: inv.reminder_count, last_reminder_at: inv.last_reminder_at }).eq("id", inv.id);
    run.failed.push({ number: inv.number, error: result.error ?? "Email failed" });
  }
  return run;
}
