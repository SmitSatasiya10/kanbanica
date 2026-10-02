"use client";

import { CopyIcon, LinkIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  disableInviteLink,
  regenerateInviteLink,
  setInviteLinkRole,
  updateInviteLinkSettings,
} from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { InviteLinkRole } from "@/db/schema/workspace";
import {
  getInviteLinkState,
  INVITE_LINK_EXPIRY_PRESETS,
  INVITE_LINK_MAX_USES_PRESETS,
} from "@/lib/invite-link";

interface InviteLinkCardProps {
  appUrl: string;
  /** Owners/Admins may manage the link; everyone else sees a read-only view. */
  canManage: boolean;
  inviteLinkExpiresAt: string | null;
  inviteLinkMaxUses: number | null;
  inviteLinkRole: InviteLinkRole;
  inviteLinkToken: string | null;
  inviteLinkUses: number;
  /** Set when the link's role bucket is at its limit (joins are blocked). */
  joinBlockedRole?: InviteLinkRole | null;
  workspaceId: string;
}

const ROLE_OPTIONS: { value: InviteLinkRole; label: string }[] = [
  { value: "MEMBER", label: "Member" },
  { value: "GUEST", label: "Guest" },
];

export function InviteLinkCard({
  workspaceId,
  inviteLinkToken,
  inviteLinkRole,
  inviteLinkExpiresAt,
  inviteLinkMaxUses,
  inviteLinkUses,
  joinBlockedRole,
  appUrl,
  canManage,
}: InviteLinkCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  // `now` is set after mount so server and client markup match (hydration).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const expiresAt = inviteLinkExpiresAt ? new Date(inviteLinkExpiresAt) : null;
  const linkState = now
    ? getInviteLinkState(
        {
          token: inviteLinkToken,
          expiresAt,
          maxUses: inviteLinkMaxUses,
          uses: inviteLinkUses,
        },
        now
      )
    : "active";
  const expiryLabel = expiresAt
    ? `${expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} (UTC)`
    : null;
  const daysLeft =
    expiresAt && now
      ? Math.max(
          0,
          Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)
        )
      : null;
  const usesLabel =
    inviteLinkMaxUses === null
      ? "Unlimited uses"
      : `${inviteLinkUses.toLocaleString("en-US")} of ${inviteLinkMaxUses.toLocaleString("en-US")} uses`;
  const expiryValue = expiresAt ? "current" : "never";
  const maxUsesValue =
    inviteLinkMaxUses === null ? "unlimited" : String(inviteLinkMaxUses);
  const maxUsesIsPreset =
    inviteLinkMaxUses !== null &&
    (INVITE_LINK_MAX_USES_PRESETS as readonly number[]).includes(
      inviteLinkMaxUses
    );

  const inviteUrl = inviteLinkToken
    ? `${appUrl}/join/${inviteLinkToken}`
    : null;

  function run(
    action: () => Promise<{ ok?: true; error?: string } | { error: string }>,
    onSuccess?: () => void
  ) {
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  async function copyLink() {
    if (!inviteUrl) {
      return;
    }
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="normal-case tracking-normal text-base font-semibold">
          Invite via link
        </CardTitle>
        <CardDescription>
          Anyone with this link can join the workspace after signing in. Set an
          expiry or a maximum number of uses to limit how it can be shared, or
          disable or regenerate it at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {joinBlockedRole && (
          <p className="text-xs text-warning">
            Joining via this link is blocked: the workspace has reached its{" "}
            {joinBlockedRole === "GUEST" ? "guest" : "member"} limit.
          </p>
        )}
        {inviteUrl ? (
          <>
            <div className="flex gap-2">
              <Input className="font-mono text-xs" readOnly value={inviteUrl} />
              <Button
                aria-label="Copy link"
                onClick={copyLink}
                size="icon"
                variant="outline"
              >
                <CopyIcon className="size-4" />
              </Button>
            </div>

            <p className="text-xs text-base-content/60">
              {expiryLabel
                ? `${daysLeft !== null && linkState !== "expired" ? `Expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"} · ` : ""}Until ${expiryLabel}`
                : "Never expires"}{" "}
              · {usesLabel}
            </p>
            {linkState === "expired" && (
              <p className="text-xs text-warning">
                This link has expired — regenerate it to share a new one.
              </p>
            )}
            {linkState === "exhausted" && (
              <p className="text-xs text-warning">
                This link has reached its maximum number of uses — regenerate it
                to share a new one.
              </p>
            )}

            {canManage && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-base-content/60">
                    Expires
                  </Label>
                  <Select
                    disabled={pending}
                    onValueChange={(value) => {
                      if (value === "current") {
                        return;
                      }
                      run(
                        () =>
                          updateInviteLinkSettings({
                            workspaceId,
                            expiresInDays:
                              value === "never" ? null : Number(value),
                            maxUses: inviteLinkMaxUses,
                          }),
                        () => toast.success("Invite link expiry updated")
                      );
                    }}
                    value={expiryValue}
                  >
                    <SelectTrigger
                      aria-label="Invite link expiry"
                      className="w-[150px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="p-1.5">
                      <SelectItem value="never">Never</SelectItem>
                      {expiresAt && (
                        <SelectItem value="current">
                          Until {expiryLabel}
                        </SelectItem>
                      )}
                      {INVITE_LINK_EXPIRY_PRESETS.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                          {days === 1 ? "1 day" : `${days} days`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-base-content/60">
                    Max uses
                  </Label>
                  <Select
                    disabled={pending}
                    onValueChange={(value) =>
                      run(
                        () =>
                          updateInviteLinkSettings({
                            workspaceId,
                            expiresInDays: "keep",
                            maxUses:
                              value === "unlimited" ? null : Number(value),
                          }),
                        () => toast.success("Invite link max uses updated")
                      )
                    }
                    value={maxUsesValue}
                  >
                    <SelectTrigger
                      aria-label="Invite link max uses"
                      className="w-[130px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="p-1.5">
                      <SelectItem value="unlimited">Unlimited</SelectItem>
                      {inviteLinkMaxUses !== null && !maxUsesIsPreset && (
                        <SelectItem value={String(inviteLinkMaxUses)}>
                          {inviteLinkMaxUses.toLocaleString("en-US")}
                        </SelectItem>
                      )}
                      {INVITE_LINK_MAX_USES_PRESETS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-base-content/60">Joins as</Label>
                <Select
                  disabled={pending}
                  onValueChange={(value) =>
                    run(
                      () =>
                        setInviteLinkRole(workspaceId, value as InviteLinkRole),
                      () => toast.success("Invite link role updated")
                    )
                  }
                  value={inviteLinkRole}
                >
                  <SelectTrigger
                    aria-label="Invite link role"
                    className="w-[140px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="p-1.5">
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Dialog onOpenChange={setRegenerateOpen} open={regenerateOpen}>
                  <DialogTrigger asChild>
                    <Button disabled={pending} variant="outline">
                      Regenerate
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Regenerate invite link?</DialogTitle>
                      <DialogDescription>
                        This will immediately invalidate the current link.
                        Anyone with the old link will no longer be able to join.
                        The new link starts with no expiry and unlimited uses.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        onClick={() => setRegenerateOpen(false)}
                        variant="outline"
                      >
                        Cancel
                      </Button>
                      <Button
                        className="gap-2"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => regenerateInviteLink(workspaceId),
                            () => {
                              setRegenerateOpen(false);
                              toast.success("New invite link generated");
                            }
                          )
                        }
                      >
                        {pending && <Spinner className="size-4" />}
                        Regenerate link
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => disableInviteLink(workspaceId),
                      () => toast.success("Invite link disabled")
                    )
                  }
                  variant="outline"
                >
                  Disable link
                </Button>
              </div>
            )}
          </>
        ) : canManage ? (
          <Button
            className="gap-2"
            disabled={pending}
            onClick={() =>
              run(
                () => regenerateInviteLink(workspaceId),
                () => toast.success("Invite link enabled")
              )
            }
          >
            {pending ? (
              <Spinner className="size-4" />
            ) : (
              <LinkIcon className="size-4" />
            )}
            Enable invite link
          </Button>
        ) : (
          <p className="text-sm text-base-content/60">
            No invite link is active. An owner or admin can enable one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
