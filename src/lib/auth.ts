import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "staff" | "customer";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, email, full_name, role").eq("id", user.id).single();
  return (data as Profile) ?? null;
});

/** Redirects away unless the signed-in user has one of the given roles. */
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}

export const homeFor = (role: Role) => (role === "customer" ? "/portal" : "/dashboard");
