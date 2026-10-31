import Link from "next/link";
import { signUp } from "../actions";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Create your account</h2>
      <AuthForm
        action={signUp}
        submitLabel="Create account"
        fields={[
          { name: "full_name", label: "Full name", autoComplete: "name" },
          { name: "company", label: "Company (optional)", autoComplete: "organization", required: false },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", checkPassword: true },
          { name: "confirm", label: "Confirm password", type: "password", autoComplete: "new-password" },
        ]}
        footer={
          <>
            Already have an account? <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
          </>
        }
      />
    </>
  );
}
