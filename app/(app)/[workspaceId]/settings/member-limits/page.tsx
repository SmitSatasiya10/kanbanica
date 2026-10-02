import { redirect } from "next/navigation";

interface MemberLimitsRedirectProps {
  params: Promise<{ workspaceId: string }>;
}

// Member & Guest limits now live on the combined Limits page. Kept so existing
// links and bookmarks to the old route still work.
export default async function MemberLimitsRedirect({
  params,
}: MemberLimitsRedirectProps) {
  const { workspaceId } = await params;
  redirect(`/${workspaceId}/settings/limits`);
}
