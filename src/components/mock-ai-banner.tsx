import type { MockAiStatus } from "@/lib/llm/mock-status";

export function MockAiBanner({ status }: { status: MockAiStatus }) {
  if (!status.active || !status.reason) {
    return null;
  }

  return (
    <div className="border-b border-[#D92D20]/25 bg-[#FFF4F2] px-4 py-2 text-sm text-[#7A271A]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Dev mock AI active</span>
        <span>{status.reason}</span>
      </div>
    </div>
  );
}
