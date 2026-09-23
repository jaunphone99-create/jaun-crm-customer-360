import { redirect } from "next/navigation";

import { getAccess, homePath } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const access = await getAccess().catch(() => null);
  redirect(access ? homePath(access) : "/login");
}
