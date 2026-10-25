import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { signedInDestination } from "@/lib/auth-navigation";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? signedInDestination(user.role) : "/login");
}
