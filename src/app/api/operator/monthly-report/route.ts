import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  defaultMonthlyWindow,
  generateMonthlyCheckInReport,
} from "@/lib/monthly-report";
import { requestIdFromRequest, requestIdHeaders } from "@/lib/logger";
import { canAccessClient } from "@/lib/rbac";

export async function GET(request: Request) {
  const requestId = requestIdFromRequest(request);
  const user = await requireUser("operator");

  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  const asOfParam = url.searchParams.get("asOf");
  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json(
      { error: "Forbidden." },
      { status: 403, headers: requestIdHeaders(requestId) },
    );
  }

  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    return NextResponse.json(
      { error: "Invalid asOf date" },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }
  const { windowStart, windowEnd } = defaultMonthlyWindow(asOf);

  const report = await generateMonthlyCheckInReport({
    clientId,
    windowStart,
    windowEnd,
  });
  return NextResponse.json(report, { headers: requestIdHeaders(requestId) });
}
