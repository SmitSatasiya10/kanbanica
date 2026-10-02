import { redirect } from "next/navigation";
import { PRODUCT_NAME } from "@/config/platform";
import { getCurrentSession } from "@/lib/authz";
import { safeNextPath, userHasDisplayName } from "@/lib/profile-name";
import { CompleteProfileForm } from "./complete-profile-form";

export const metadata = { title: `Complete your profile — ${PRODUCT_NAME}` };

export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  const next = safeNextPath((await searchParams).next);
  if (await userHasDisplayName(session.user.id)) {
    redirect(next);
  }
  return <CompleteProfileForm next={next} />;
}
