import { redirect } from "next/navigation";

export default function ClientActivityPage() {
  redirect("/client/inbox?sort=recent");
}
