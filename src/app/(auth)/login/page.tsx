import Link from "next/link";
import { signIn } from "../actions";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Sign in</h2>
      <AuthForm
        action={signIn}
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        footer={
          <div className="space-y-1">
            <Link href="/forgot-password" className="text-brand hover:underline">Forgot your password?</Link>
            <div>
              New to Brightloop? <Link href="/signup" className="font-medium text-brand hover:underline">Create an account</Link>
            </div>
          </div>
        }
      />
    </>
  );
}
