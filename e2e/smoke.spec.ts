import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// End-to-end smoke test of the core money flow, driven through the real UI:
// a customer signs up → an admin creates a subscription for them, adds a line, confirms,
// activates and bills it → the customer sees the invoice in the portal and pays it.
// Uses isolated catalogue fixtures and removes everything it created afterwards.

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const id = randomUUID().slice(0, 8);
const customer = { name: `E2E Customer ${id}`, email: `e2e-${id}@example.com`, password: `E2e-${randomUUID()}!aA` };
const made: { plan?: string; product?: string; tax?: string } = {};

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.beforeAll(async () => {
  expect(process.env.DEMO_TEST_PASSWORD, "Set DEMO_TEST_PASSWORD (environment or .env.local)").toBeTruthy();
  const tax = await service.from("taxes").insert({ name: `E2E tax ${id}`, rate: 18 }).select("id").single();
  const product = await service.from("products").insert({ name: `E2E product ${id}`, sales_price: 500, tax_id: tax.data!.id }).select("id").single();
  const plan = await service.from("plans").insert({ name: `E2E plan ${id}`, price: 500, billing_period: "monthly" }).select("id").single();
  made.tax = tax.data!.id; made.product = product.data!.id; made.plan = plan.data!.id;
});

test.afterAll(async () => {
  const { data: c } = await service.from("customers").select("id, user_id").eq("email", customer.email).maybeSingle();
  if (c) {
    await service.from("invoices").delete().eq("customer_id", c.id);
    await service.from("subscriptions").delete().eq("customer_id", c.id);
    await service.from("customers").delete().eq("id", c.id);
    if (c.user_id) await service.auth.admin.deleteUser(c.user_id);
  }
  if (made.plan) await service.from("plans").delete().eq("id", made.plan);
  if (made.product) await service.from("products").delete().eq("id", made.product);
  if (made.tax) await service.from("taxes").delete().eq("id", made.tax);
});

test("sign up → admin bills a subscription → customer pays", async ({ browser }) => {
  // 1. A new customer signs up and lands in an empty portal.
  const customerCtx = await browser.newContext();
  const cp = await customerCtx.newPage();
  await cp.goto("/signup");
  await cp.getByLabel("Full name").fill(customer.name);
  await cp.getByLabel("Email").fill(customer.email);
  await cp.getByLabel("Password", { exact: true }).fill(customer.password);
  await cp.getByLabel("Confirm password").fill(customer.password);
  await cp.getByRole("button", { name: "Create account" }).click();
  await expect(cp).toHaveURL(/\/portal$/);
  await expect(cp.getByText("You don't have any subscriptions yet")).toBeVisible();
  const { data: row } = await service.from("customers").select("id").eq("email", customer.email).single();
  const customerId = row!.id as string;

  // 2. The admin creates a subscription for them, adds a line, confirms, activates and bills it.
  const adminCtx = await browser.newContext();
  const ap = await adminCtx.newPage();
  await signIn(ap, "demo.admin@example.com", process.env.DEMO_TEST_PASSWORD!);
  await expect(ap).toHaveURL(/\/dashboard$/);
  await ap.goto(`/subscriptions/new?customer=${customerId}`);
  await ap.locator('select[name="customer_id"]').selectOption(customerId);
  await ap.locator('select[name="plan_id"]').selectOption(made.plan!);
  await ap.getByRole("button", { name: "Create subscription" }).click();
  await expect(ap).toHaveURL(/\/subscriptions\/[0-9a-f-]{36}/);

  await ap.locator('select[name="product_id"]').last().selectOption(made.product!);
  await ap.getByRole("button", { name: "Add line" }).click();
  await expect(ap.getByText(`E2E product ${id}`).first()).toBeVisible();
  await ap.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(ap.getByText("Lines are locked after confirmation.")).toBeVisible();
  await ap.getByRole("button", { name: "Activate" }).click();
  await expect(ap.getByRole("button", { name: "Bill now" })).toBeVisible();
  await ap.getByRole("button", { name: "Bill now" }).click();
  await expect(ap).toHaveURL(/\/invoices\/[0-9a-f-]{36}/);
  const invoiceUrl = new URL(ap.url());
  const invoiceId = invoiceUrl.pathname.split("/")[2];
  // 500 + 18% tax, issued as confirmed so the customer can pay it.
  await expect(ap.getByText("₹590.00").first()).toBeVisible();
  await expect(ap.getByRole("heading", { name: "Record payment" })).toBeVisible();

  // 3. The customer sees the active subscription and pays the invoice from the portal.
  await cp.goto("/portal");
  await expect(cp.getByText("Active").first()).toBeVisible();
  await cp.goto("/portal/invoices?filter=outstanding");
  await cp.getByRole("link", { name: /^INV-/ }).first().click();
  await expect(cp).toHaveURL(new RegExp(`/portal/invoices/${invoiceId}`));
  await cp.locator('select[name="method"]').selectOption("upi");
  await cp.getByRole("button", { name: "Pay ₹590.00" }).click();
  await expect(cp.getByText("Payment of ₹590.00 received. Thank you!")).toBeVisible();
  await expect(cp.getByText("Thank you, this invoice is fully paid.")).toBeVisible();

  // 4. Staff see it as paid.
  await ap.reload();
  await expect(ap.getByText("This invoice is fully paid.")).toBeVisible();
  const { data: paid } = await service.from("invoices").select("status, amount_paid, total").eq("id", invoiceId).single();
  expect(paid).toMatchObject({ status: "paid" });
  expect(Number(paid!.amount_paid)).toBe(590);

  await customerCtx.close();
  await adminCtx.close();
});
