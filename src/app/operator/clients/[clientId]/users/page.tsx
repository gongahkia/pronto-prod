import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/date-format";
import { getClient } from "@/lib/dashboard";
import { query } from "@/lib/db";
import { listStaffCapabilities, staffCapabilities } from "@/lib/staff-permissions";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";

type ClientUserRow = {
  id: string;
  email: string;
  name: string;
  role: "operator" | "client";
  created_at: Date;
};

async function listUsersForClient(clientId: string): Promise<ClientUserRow[]> {
  const result = await query<ClientUserRow>(
    `select id, email, name, role, created_at
     from users
     where client_id = $1
     order by created_at asc`,
    [clientId],
  );
  return result.rows;
}

export default async function ClientUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<{ error?: string; ok?: string }>;
}) {
  const actor = await requireUser("operator");
  const { clientId } = await params;
  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }
  const params2 = (await searchParams) ?? {};
  const users = await listUsersForClient(clientId);
  const grants = await listStaffCapabilities(clientId);

  return (
    <AppShell user={actor} active="operator">
      <OperatorClientHeader client={client} />
      <OperatorClientNav clientId={clientId} active="users" />

      {params2.error ? (
        <p className="mb-4 rounded-md border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">
          {decodeURIComponent(params2.error)}
        </p>
      ) : null}
      {params2.ok ? (
        <p className="mb-4 rounded-md border border-success/25 bg-success-bg px-3 py-2 text-sm text-success">
          {decodeURIComponent(params2.ok)}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Users</h2>
            <p className="text-sm text-muted">
              Client-role users can sign in and access only this client&apos;s workspace.
            </p>
          </div>
          <div className="divide-y divide-line">
            {users.length === 0 ? (
              <p className="p-4 text-sm text-muted">No users yet.</p>
            ) : (
              users.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-sm text-muted">{row.email}</p>
                    <p className="text-xs text-muted">
                      Added {formatDate(row.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={row.role === "operator" ? "amber" : "neutral"}>
                      {row.role}
                    </Badge>
                    {row.id === actor.userId ? null : (
                      <form
                        action={`/api/operator/clients/${clientId}/users/${row.id}/delete`}
                        method="post"
                      >
                        <button
                          className="rounded-md border border-line px-2 py-1 text-xs text-danger hover:bg-surface-hover"
                        >
                          Remove
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <form
          action={`/api/operator/clients/${clientId}/users`}
          method="post"
          className="ui-panel space-y-4 p-5"
        >
          <div>
            <h2 className="text-base font-semibold">Add user</h2>
            <p className="text-xs text-muted">
              Default role is client (single-client access). Use operator only for internal staff.
            </p>
          </div>

          <label className="block text-sm font-medium">
            Name
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-sm font-medium">
            Initial password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
              placeholder="At least 8 characters"
            />
          </label>
          <label className="block text-sm font-medium">
            Role
            <select
              name="role"
              defaultValue="client"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
            >
              <option value="client">Client (default)</option>
              <option value="operator">Operator (internal staff)</option>
            </select>
          </label>

          <button className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark">
            Add user
          </button>
        </form>
      </section>
      <section className="ui-panel mt-6 p-4">
        <h2 className="font-semibold">Business staff permissions</h2>
        <p className="mb-3 text-sm text-muted">New and existing client accounts have no implicit approval or activation authority. Record the business authorization before granting access.</p>
        {users.filter((row) => row.role === "client").map((row) => <div key={row.id} className="border-t border-line py-3 text-sm">
          <strong>{row.name}</strong> · {row.email}
          <p className="text-xs text-muted">Granted: {grants.filter((grant) => grant.user_id === row.id).map((grant) => grant.permission).join(", ") || "none"}</p>
          <form action={`/api/operator/clients/${clientId}/permissions`} method="post" className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="userId" value={row.id}/>
            <select className="ui-input px-2 py-1" name="capability" aria-label={`Permission for ${row.name}`}>
              {staffCapabilities.map((capability) => <option key={capability} value={capability}>{capability}</option>)}
            </select>
            <input className="ui-input px-2 py-1" name="evidence" required aria-label={`Authorization evidence for ${row.name}`} placeholder="Authorization record"/>
            <button className="ui-button px-2 py-1" name="action" value="grant">Grant</button>
            <button className="ui-button px-2 py-1" name="action" value="revoke">Revoke</button>
          </form>
        </div>)}
      </section>
    </AppShell>
  );
}
