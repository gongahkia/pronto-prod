import type { MockAiStatus } from "@/lib/llm/mock-status";

export function MockAiBanner({ status }: { status: MockAiStatus }) {
  if (!status.active || !status.reason) {
    return null;
  }
  const previewMode = status.reason === "PRONTO_USE_MOCK_AI=1";

  return (
    <div
      className="border-b border-[#D92D20]/25 bg-[#FFF4F2] px-4 py-2 text-sm text-[#7A271A]"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{previewMode ? "Response preview mode" : "AI connection needs review"}</span>
        <span>{previewMode
          ? "Answers are simulated in this environment. Check your connection before serving customers."
          : "Check the model configuration before relying on automated replies."}</span>
      </div>
    </div>
  );
}
