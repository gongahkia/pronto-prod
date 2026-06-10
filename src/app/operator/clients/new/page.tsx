import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

const PLAN_TIERS = [
  { value: "pilot", label: "Pilot (2-4 week scoped)" },
  { value: "starter", label: "Starter (24h business-hours SLA)" },
  { value: "growth", label: "Growth (4h business-hours SLA)" },
  { value: "scale", label: "Scale (1h business-hours SLA)" },
  { value: "enterprise", label: "Enterprise (custom)" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft (no production traffic)" },
  { value: "pilot", label: "Pilot (limited scope)" },
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
];

export default async function NewClientPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await requireUser("operator");
  const params = (await searchParams) ?? {};

  return (
    <AppShell user={user} active="operator" operatorActive="clients">
      <div className="mb-5">
        <Link href="/operator" className="text-xs font-medium text-accent hover:text-accent-dark">
          Back to operator dashboard
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold">Create client</h1>
        <p className="text-sm text-muted">
          Creates the client, default agent config, brand voice, triage flow, and a console channel for QA. Configure real channels under the new client&apos;s workspace once created.
        </p>
      </div>

      {params.error ? (
        <p className="mb-4 rounded-md border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">
          {decodeURIComponent(params.error)}
        </p>
      ) : null}

      <form
        action="/api/operator/clients"
        method="post"
        className="space-y-5 ui-panel p-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">
            Client name
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
              placeholder="Northbridge Nasi"
            />
          </label>
          <label className="block text-sm font-medium">
            Slug
            <input
              name="slug"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
              placeholder="northbridge-nasi (auto from name if blank)"
            />
          </label>
          <label className="block text-sm font-medium">
            Vertical
            <input
              name="vertical"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
              placeholder="f-and-b, e-commerce, services..."
            />
          </label>
          <label className="block text-sm font-medium">
            Plan tier
            <select
              name="planTier"
              defaultValue="pilot"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
            >
              {PLAN_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Status
            <select
              name="status"
              defaultValue="draft"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium">
          Brand voice (optional starter)
          <textarea
            name="brandVoice"
            rows={3}
            className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
            placeholder="Clear, practical, professional. Concise replies. Escalate instead of guessing."
          />
        </label>

        <fieldset className="rounded-md border border-line p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Initial client user (optional)
          </legend>
          <p className="text-xs text-muted">
            Create the first client owner now, or skip and add users from the client workspace.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="block text-sm font-medium">
              Name
              <input
                name="initialUserName"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
                placeholder="Owner name"
              />
            </label>
            <label className="block text-sm font-medium">
              Email
              <input
                name="initialUserEmail"
                type="email"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
                placeholder="owner@example.com"
              />
            </label>
            <label className="block text-sm font-medium">
              Initial password
              <input
                name="initialUserPassword"
                type="text"
                minLength={8}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
                placeholder="At least 8 characters"
              />
            </label>
          </div>
        </fieldset>

        <div className="flex justify-end gap-3">
          <Link href="/operator" className="ui-button px-4 py-2 text-muted">
            Cancel
          </Link>
          <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark">
            Create client
          </button>
        </div>
      </form>
    </AppShell>
  );
}
