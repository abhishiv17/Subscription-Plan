import type { SupabaseClient } from "@supabase/supabase-js";

/** Accept both default Supabase email redirects and custom token-hash links. */
export async function acceptInvitation(client: SupabaseClient, location: string) {
  const url = new URL(location);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (fragment.get("error") || url.searchParams.get("error")) throw new Error("Invalid invitation");
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const result = accessToken && refreshToken
    ? await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    : code ? await client.auth.exchangeCodeForSession(code)
    : tokenHash ? await client.auth.verifyOtp({ token_hash: tokenHash, type: "invite" })
    : null;
  if (!result || result.error || !result.data.session) throw new Error("Invalid or expired invitation");
}
