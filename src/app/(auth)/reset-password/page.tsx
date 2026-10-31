import Link from "next/link";
import { resetPassword } from "../actions";
import { AuthForm } from "@/components/auth-form";

export default function ResetPasswordPage() {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Choose a new password</h2>
      <AuthForm
        action={resetPassword}
        submitLabel="Update password"
        fields={[
          { name: "password", label: "New password", type: "password", autoComplete: "new-password", checkPassword: true },
          { name: "confirm", label: "Confirm password", type: "password", autoComplete: "new-password" },
        ]}
        footer={<Link href="/" className="text-brand hover:underline">Continue to the app</Link>}
      />
    </>
  );
}
