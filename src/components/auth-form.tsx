"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { FormState } from "@/app/(auth)/actions";
import { Alert, Button, Field, Input } from "@/components/ui";
import { passwordProblems } from "@/lib/validation";

type FieldDef = { name: string; label: string; type?: string; autoComplete?: string; required?: boolean; checkPassword?: boolean };

export function AuthForm({
  action,
  fields,
  submitLabel,
  footer,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: FieldDef[];
  submitLabel: string;
  footer?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [password, setPassword] = useState("");
  const problems = passwordProblems(password);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      {fields.map((f) => (
        <Field key={f.name} label={f.label}>
          <Input
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            required={f.required ?? true}
            onChange={f.checkPassword ? (e) => setPassword(e.target.value) : undefined}
          />
          {f.checkPassword && password && (
            <span className="block pt-1">
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i < 4 - problems.length ? (problems.length ? "bg-loop" : "bg-emerald-500") : "bg-slate-200"
                    }`}
                  />
                ))}
              </span>
              <span className={`mt-1.5 block text-xs ${problems.length ? "text-slate-600" : "text-emerald-700"}`}>
                {problems.length ? `Still needs ${problems.join(", ")}` : "Strong password"}
              </span>
            </span>
          )}
        </Field>
      ))}
      <Button type="submit" className="!h-10 w-full" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </Button>
      {footer && <div className="pt-2 text-center text-sm text-slate-600">{footer}</div>}
    </form>
  );
}
