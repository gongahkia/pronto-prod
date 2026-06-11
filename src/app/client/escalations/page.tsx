import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOpenEscalations } from "@/lib/dashboard";
import { listClientStaff } from "@/lib/escalations-bulk";
import { AppShell } from "@/components/shell";
import { BulkEscalationList } from "@/components/bulk-escalation-list";

export const dynamic = "force-dynamic";

export default async function ClientEscalationsPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    notFound();
  }
  const [escalations, staff] = await Promise.all([
    getOpenEscalations(user.clientId),
    listClientStaff(user.clientId),
  ]);

  return (
    <AppShell user={user} active="client">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Escalations</h1>
        <p className="text-sm text-muted">
          Open items that need a human reply. Multi-select to claim, assign, or
          resolve.
        </p>
      </div>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Open escalations</h2>
        </div>
        <div className="p-4">
          <BulkEscalationList
            clientId={user.clientId}
            escalations={escalations}
            staff={staff}
            allowAssign={staff.length > 1}
            hrefForConversation={(_, conversationId) =>
              `/client/conversations/${conversationId}`
            }
          />
        </div>
      </section>
    </AppShell>
  );
}
