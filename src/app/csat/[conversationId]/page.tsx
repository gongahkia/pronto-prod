import { notFound } from "next/navigation";
import { getCsatConversationContext } from "@/lib/csat";

export default async function CsatPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ messageId?: string; submitted?: string }>;
}) {
  const [{ conversationId }, query] = await Promise.all([params, searchParams]);
  const context = await getCsatConversationContext(conversationId);
  if (!context) {
    notFound();
  }

  const submitted = query.submitted === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-line bg-panel p-6">
        <p className="text-xs font-medium text-muted">
          Customer feedback
        </p>
        <h1 className="mt-2 text-xl font-semibold">{context.client.name}</h1>
        {submitted ? (
          <p className="mt-4 text-sm text-muted">
            Thanks. Your feedback was recorded.
          </p>
        ) : (
          <form action="/api/csat" method="post" className="mt-4 space-y-4">
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="messageId" value={query.messageId ?? ""} />
            <label className="block space-y-2 text-sm font-medium">
              <span>How helpful was the reply?</span>
              <select
                name="score"
                defaultValue="5"
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
              >
                <option value="5">5 - Very helpful</option>
                <option value="4">4 - Helpful</option>
                <option value="3">3 - Okay</option>
                <option value="2">2 - Not helpful</option>
                <option value="1">1 - Poor</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Comment</span>
              <textarea
                name="comment"
                rows={3}
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                placeholder="Optional"
              />
            </label>
            <button className="ui-primary-button px-4 py-2">
              Submit feedback
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
