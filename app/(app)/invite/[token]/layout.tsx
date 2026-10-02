import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/authz";
import { completeProfileUrl, userHasDisplayName } from "@/lib/profile-name";

// Logged-out visitors log in first (token preserved); a signed-in user with no
// display name sets one before accepting the invite.
export default async function InviteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    // Keep the token across login (cookie set in the route handler).
    redirect(`/api/invite/${encodeURIComponent((await params).token)}`);
  }
  if (!(await userHasDisplayName(session.user.id))) {
    const { token } = await params;
    redirect(completeProfileUrl(`/invite/${token}`));
  }
  return children;
}
