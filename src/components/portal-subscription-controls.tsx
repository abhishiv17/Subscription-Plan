import { portalRenew, portalSetStatus } from "@/app/portal/actions";
import { Button } from "@/components/ui";

type Plan = { pausable: boolean; closable: boolean; renewable: boolean };

/**
 * Self-service buttons, shown only where the plan allows them. The database enforces the
 * same rules (plan flags, lifecycle transitions and ownership), so a forged request still fails.
 */
export function PortalSubscriptionControls({ id, status, plan, expiry, returnTo }: { id: string; status: string; plan: Plan; expiry: string | null; returnTo: string }) {
  if (status !== "active" && status !== "paused") return null;
  const today = new Date().toISOString().slice(0, 10);
  const canClose = plan.closable || (expiry !== null && expiry < today);
  return (
    <div className="flex flex-wrap gap-2">
      {status === "active" && plan.pausable && (
        <form action={portalSetStatus.bind(null, id, "paused", returnTo)}><Button variant="secondary">Pause</Button></form>
      )}
      {status === "paused" && <form action={portalSetStatus.bind(null, id, "active", returnTo)}><Button>Resume</Button></form>}
      {plan.renewable && <form action={portalRenew.bind(null, id, returnTo)}><Button variant="secondary">Renew</Button></form>}
      {canClose && <form action={portalSetStatus.bind(null, id, "closed", returnTo)}><Button variant="danger">Cancel subscription</Button></form>}
    </div>
  );
}
