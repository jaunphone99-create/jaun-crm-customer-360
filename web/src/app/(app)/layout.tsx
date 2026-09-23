import { redirect } from "next/navigation";

import { AppShell } from "@/features/shell/AppShell";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess().catch(() => null);
  if (!access) redirect("/login");
  return (
    <AppShell access={access}>{children}</AppShell>
  );
}
