"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Alert } from "@/components/ui";
import { acceptInvitation } from "@/lib/invitations";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const verification = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let active = true;
    if (!verification.current) {
      // Process a one-time link once, including during React Strict Mode effect replay.
      const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        isSingleton: false,
        auth: { detectSessionInUrl: false },
      });
      verification.current = acceptInvitation(client, window.location.href);
    }
    verification.current.then(() => {
      if (!active) return;
      window.history.replaceState(null, "", "/accept-invite");
      router.replace("/reset-password");
      router.refresh();
    }).catch(() => {
      if (!active) return;
      window.history.replaceState(null, "", "/accept-invite");
      setError("This invitation link is missing, invalid or expired. Ask your administrator for help, or log in if you already have an account.");
    });
    return () => { active = false; };
  }, [router]);
  return <><h2 className="mb-4 text-lg font-semibold">Accept your invitation</h2>
    {error ? <Alert>{error}</Alert> : <p className="text-sm text-slate-600" role="status">Verifying your invitation...</p>}
    <Link href="/login" className="mt-5 inline-block text-sm text-brand hover:underline">Back to login</Link>
  </>;
}
