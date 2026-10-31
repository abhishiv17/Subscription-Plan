export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** More than eight characters, with an uppercase letter, a lowercase letter and a special character. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length <= 8) problems.push("more than 8 characters");
  if (!/[A-Z]/.test(password)) problems.push("an uppercase letter");
  if (!/[a-z]/.test(password)) problems.push("a lowercase letter");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("a special character");
  return problems;
}

export function passwordError(password: string): string | null {
  const problems = passwordProblems(password);
  return problems.length ? `Password needs ${problems.join(", ")}.` : null;
}
