import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runOverdueReminders } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // Fail closed when the secret isn't configured.
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily overdue reminders, called by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`. Add `?dryRun=1` to preview without sending.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const run = await runOverdueReminders(createAdminClient(), { dryRun: req.nextUrl.searchParams.get("dryRun") === "1" });
    return NextResponse.json({ ...run, preview: run.preview.slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reminder run failed" }, { status: 500 });
  }
}
