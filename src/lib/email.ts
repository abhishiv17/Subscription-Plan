import "server-only";

export type EmailResult = { sent: boolean; error?: string };

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

/** Sends one email through Resend. Without RESEND_API_KEY nothing is sent and `sent` is false. */
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) return { sent: false, error: "Email is not configured (RESEND_API_KEY)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.INVOICE_FROM_EMAIL ?? "Brightloop Billing <onboarding@resend.dev>", to, subject, html }),
    });
    return res.ok ? { sent: true } : { sent: false, error: `Email provider responded ${res.status}.` };
  } catch {
    return { sent: false, error: "The email provider could not be reached." };
  }
}

/** Public link to an invoice in the customer portal. */
export const portalInvoiceUrl = (invoiceId: string) => `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/portal/invoices/${invoiceId}`;
