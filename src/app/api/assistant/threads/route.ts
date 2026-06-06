import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  getAssistantThreadDetail,
  listAssistantThreads,
} from "@/lib/assistant/store";

const threadQuerySchema = z.object({
  threadId: z.string().uuid().optional().nullable(),
});

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const parsed = threadQuerySchema.parse({
    threadId: url.searchParams.get("threadId"),
  });
  if (parsed.threadId) {
    const detail = await getAssistantThreadDetail({
      user,
      threadId: parsed.threadId,
    });
    if (!detail) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  }

  const threads = await listAssistantThreads(user);
  return NextResponse.json({ threads });
}
