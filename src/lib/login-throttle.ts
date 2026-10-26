import { createHmac } from "node:crypto";
import { query } from "@/lib/db";

// Shared PostgreSQL buckets work across Vercel instances. No raw email/IP storage.
export async function allowLoginAttempt(email: string, now = new Date()): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.PRONTO_LOGIN_THROTTLE !== "1") return true;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Login throttle requires server authentication configuration.");
  const start = new Date(Math.floor(now.getTime() / 900000) * 900000);
  const account = createHmac("sha256", secret).update(email.trim().toLowerCase().slice(0,320)).digest("hex");
  await query("delete from auth_login_attempts where window_start<$1", [new Date(now.getTime()-86400000)]);
  for (const [key, limit] of [["global",120],[account,8]] as const) {
    const result = await query<{ attempts: number }>(`insert into auth_login_attempts(key,window_start,attempts)
      values($1,$2,1) on conflict(key,window_start) do update set attempts=auth_login_attempts.attempts+1 returning attempts`, [key,start]);
    if (result.rows[0].attempts > limit) return false;
  }
  return true;
}
