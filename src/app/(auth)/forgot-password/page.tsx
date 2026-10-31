import Link from "next/link";
import { forgotPassword } from "../actions";
import { AuthForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Reset your password</h2>
      <p className="mb-4 text-sm text-slate-500">We&apos;ll email a reset link to your registered address.</p>
      <AuthForm
        action={forgotPassword}
        submitLabel="Send reset link"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        footer={<Link href="/login" className="text-brand hover:underline">Back to sign in</Link>}
      />
    </>
  );
}
