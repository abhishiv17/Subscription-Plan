import "server-only";
import { redirect } from "next/navigation";

/** Redirect back to a page with a one-off message shown by <Flash />. */
export function flash(path: string, kind: "ok" | "err", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

export const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export const optStr = (form: FormData, key: string) => str(form, key) || null;
export const num = (form: FormData, key: string, fallback = 0) => {
  const v = Number(str(form, key));
  return Number.isFinite(v) && str(form, key) !== "" ? v : fallback;
};
export const optNum = (form: FormData, key: string) => (str(form, key) === "" ? null : Number(str(form, key)));
export const bool = (form: FormData, key: string) => form.get(key) === "on";
