"use client";

import {
  CrownIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  TrashIcon,
  UserPlusIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  cancelInvite,
  changeMemberRole,
  inviteMember,
  removeMember,
  resendInvite,
  transferOwnership,
} from "@/app/actions/workspace";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteLinkCard } from "@/components/workspace/invite-link-card";
import type { InviteLinkRole } from "@/db/schema/workspace";

type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

interface Member {
  email: string;
  id: string;
  image: string | null;
  joinedAt: string;
  name: string;
  role: WorkspaceRole;
  userId: string;
}

interface PendingInvite {
  email: string;
  expiresAt: string | null;
  id: string;
  invitedByName: string;
  role: WorkspaceRole;
  sentAt: string;
}

interface MembersManagerProps {
  actorRole: WorkspaceRole;
  appUrl: string;
  currentUserId: string;
  inviteLinkExpiresAt: string | null;
  inviteLinkMaxUses: number | null;
  inviteLinkRole: InviteLinkRole;
  inviteLinkToken: string | null;
  inviteLinkUses: number;
  /** Seat limits + usage per bucket (limit null = unlimited). Display only. */
  memberCapacity: {
    guests: { limit: number | null; used: number; remaining: number | null };
    members: { limit: number | null; used: number; remaining: number | null };
  };
  members: Member[];
  pendingInvites: PendingInvite[];
  workspaceId: string;
  workspaceName: string;
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  GUEST: "Guest",
};

export function MembersManager({
  workspaceId,
  workspaceName,
  members,
  memberCapacity,
  pendingInvites,
  currentUserId,
  actorRole,
  inviteLinkToken,
  inviteLinkRole,
  inviteLinkExpiresAt,
  inviteLinkMaxUses,
  inviteLinkUses,
  appUrl,
}: MembersManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | WorkspaceRole>("ALL");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "GUEST">(
    "MEMBER"
  );
  const inviteEmailTrimmed = inviteEmail.trim();
  // Display-only mirrors of the server-side member/guest limit gate.
  const bucketFull = (cap: {
    limit: number | null;
    remaining: number | null;
  }) => cap.limit !== null && (cap.remaining ?? 0) === 0;
  const membersFull = bucketFull(memberCapacity.members);
  const guestsFull = bucketFull(memberCapacity.guests);
  const inviteBucketFull = inviteRole === "GUEST" ? guestsFull : membersFull;
  const seatSummary = [
    memberCapacity.members.limit !== null &&
      `${memberCapacity.members.used.toLocaleString("en-US")} / ${memberCapacity.members.limit.toLocaleString("en-US")} members`,
    memberCapacity.guests.limit !== null &&
      `${memberCapacity.guests.used.toLocaleString("en-US")} / ${memberCapacity.guests.limit.toLocaleString("en-US")} guests`,
  ].filter(Boolean);
  const inviteEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    inviteEmailTrimmed
  );

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [transferConfirm, setTransferConfirm] = useState("");

  const isOwner = actorRole === "OWNER";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== "ALL" && m.role !== roleFilter) {
        return false;
      }
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !m.email.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [members, search, roleFilter]);

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

  function canManage(target: Member) {
    if (target.userId === currentUserId || target.role === "OWNER") {
      return false;
    }
    if (actorRole === "ADMIN" && target.role === "ADMIN") {
      return false;
    }
    return true;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="normal-case tracking-normal text-base font-semibold">
                Members
              </CardTitle>
              <CardDescription>
                {members.length} {members.length === 1 ? "person" : "people"} in
                this workspace
                {seatSummary.length > 0 &&
                  ` · ${seatSummary.join(" · ")} (incl. pending invites)`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {isOwner && members.length > 1 && (
                <Dialog onOpenChange={setTransferOpen} open={transferOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" variant="outline">
                      <CrownIcon className="size-4" />
                      Transfer ownership
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Transfer ownership</DialogTitle>
                      <DialogDescription>
                        The new Owner gets full control. You become an Admin.
                        This cannot be undone by you.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>New owner</Label>
                        <Select
                          onValueChange={setTransferTarget}
                          value={transferTarget}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a member" />
                          </SelectTrigger>
                          <SelectContent className="p-1.5">
                            {members
                              .filter(
                                (m) =>
                                  m.userId !== currentUserId &&
                                  m.role !== "GUEST"
                              )
                              .map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name} ({m.email})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="transfer-confirm">
                          Type{" "}
                          <span className="normal-case font-semibold tracking-normal">
                            {workspaceName}
                          </span>{" "}
                          to confirm
                        </Label>
                        <Input
                          id="transfer-confirm"
                          onChange={(e) => setTransferConfirm(e.target.value)}
                          value={transferConfirm}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        className="gap-2"
                        disabled={
                          pending ||
                          !transferTarget ||
                          transferConfirm !== workspaceName
                        }
                        onClick={() =>
                          run(
                            () =>
                              transferOwnership({
                                workspaceId,
                                targetMemberId: transferTarget,
                                confirmName: transferConfirm,
                              }),
                            () => {
                              setTransferOpen(false);
                              toast.success("Ownership transferred");
                            }
                          )
                        }
                      >
                        {pending && <Spinner className="size-4" />}
                        Transfer ownership
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              <Dialog onOpenChange={setInviteOpen} open={inviteOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <UserPlusIcon className="size-4" />
                    Invite
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite a teammate</DialogTitle>
                    <DialogDescription>
                      They&apos;ll receive an email invite, valid for 7 days.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email address</Label>
                      <Input
                        aria-invalid={
                          inviteEmailTrimmed.length > 0 && !inviteEmailValid
                        }
                        id="invite-email"
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="teammate@example.com"
                        type="email"
                        value={inviteEmail}
                      />
                      {inviteEmailTrimmed.length > 0 && !inviteEmailValid && (
                        <p className="text-xs text-error">
                          Please enter a valid email address.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        onValueChange={(v) =>
                          setInviteRole(v as typeof inviteRole)
                        }
                        value={inviteRole}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="p-1.5">
                          {isOwner && (
                            <SelectItem value="ADMIN">Admin</SelectItem>
                          )}
                          <SelectItem value="MEMBER">Member</SelectItem>
                          <SelectItem value="GUEST">Guest</SelectItem>
                        </SelectContent>
                      </Select>
                      {inviteBucketFull && (
                        <p className="text-xs text-warning">
                          This workspace has reached its{" "}
                          {inviteRole === "GUEST" ? "guest" : "member"} limit.
                          Raise the limit in Settings → Limits or free up a seat
                          to invite more.
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      className="gap-2"
                      disabled={
                        pending || !inviteEmailValid || inviteBucketFull
                      }
                      onClick={() =>
                        run(
                          () =>
                            inviteMember({
                              workspaceId,
                              email: inviteEmailTrimmed,
                              role: inviteRole,
                            }),
                          () => {
                            setInviteOpen(false);
                            setInviteEmail("");
                            toast.success(
                              `Invite sent to ${inviteEmailTrimmed}`
                            );
                          }
                        )
                      }
                    >
                      {pending ? (
                        <Spinner className="size-4" />
                      ) : (
                        <PaperPlaneTiltIcon className="size-4" />
                      )}
                      Send invite
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-44">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-base-content/60" />
              <Input
                className="pl-8"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                value={search}
              />
            </div>
            <Select
              onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}
              value={roleFilter}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="p-1.5">
                <SelectItem value="ALL">All roles</SelectItem>
                <SelectItem value="OWNER">Owner</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="GUEST">Guest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        email={member.email}
                        image={member.image}
                        name={member.name}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {member.name}
                          {member.userId === currentUserId && (
                            <span className="text-base-content/60 font-normal">
                              {" "}
                              (you)
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-base-content/60 truncate">
                          {member.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManage(member) ? (
                      <Select
                        onValueChange={(role) =>
                          run(() =>
                            changeMemberRole({
                              workspaceId,
                              memberId: member.id,
                              role: role as "ADMIN" | "MEMBER" | "GUEST",
                            })
                          )
                        }
                        value={member.role}
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="p-1.5">
                          {isOwner && (
                            <SelectItem value="ADMIN">Admin</SelectItem>
                          )}
                          <SelectItem value="MEMBER">Member</SelectItem>
                          <SelectItem value="GUEST">Guest</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant={
                          member.role === "OWNER" ? "default" : "secondary"
                        }
                      >
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-base-content/60">
                    {format(new Date(member.joinedAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage(member) && (
                      <button
                        className="flex size-7 items-center justify-center rounded-md text-base-content/60 hover:bg-error/10 hover:text-error transition-colors"
                        onClick={() => setRemoveTarget(member)}
                        title="Remove member"
                        type="button"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-base-content/60"
                    colSpan={4}
                  >
                    No members match your search
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Remove confirmation */}
      <Dialog
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        open={!!removeTarget}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <DialogDescription>
              They lose access to this workspace and all its Spaces. Tasks they
              created or were assigned to are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setRemoveTarget(null)} variant="outline">
              Cancel
            </Button>
            <Button
              className="gap-2"
              disabled={pending}
              onClick={() =>
                removeTarget &&
                run(
                  () =>
                    removeMember({ workspaceId, memberId: removeTarget.id }),
                  () => {
                    toast.success(`${removeTarget.name} removed`);
                    setRemoveTarget(null);
                  }
                )
              }
              variant="destructive"
            >
              {pending && <Spinner className="size-4" />}
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite via link */}
      <InviteLinkCard
        appUrl={appUrl}
        canManage={actorRole === "OWNER" || actorRole === "ADMIN"}
        inviteLinkExpiresAt={inviteLinkExpiresAt}
        inviteLinkMaxUses={inviteLinkMaxUses}
        inviteLinkRole={inviteLinkRole}
        inviteLinkToken={inviteLinkToken}
        inviteLinkUses={inviteLinkUses}
        joinBlockedRole={
          // The link grants one role; show a hint when that bucket is full.
          (inviteLinkRole === "GUEST" ? guestsFull : membersFull)
            ? inviteLinkRole
            : null
        }
        workspaceId={workspaceId}
      />

      {/* Pending invites */}
      <Card>
        <CardHeader>
          <CardTitle className="normal-case tracking-normal text-base font-semibold">
            Pending invites
          </CardTitle>
          <CardDescription>
            {pendingInvites.length === 0
              ? "No outstanding invites."
              : `${pendingInvites.length} invite${pendingInvites.length === 1 ? "" : "s"} waiting to be accepted.`}
          </CardDescription>
        </CardHeader>
        {pendingInvites.length > 0 && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden md:table-cell">Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((invite) => {
                  const expired =
                    invite.expiresAt && new Date(invite.expiresAt) < new Date();
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>
                        <div className="font-medium">{invite.email}</div>
                        <div className="text-sm text-base-content/60">
                          Invited by {invite.invitedByName}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-base-content/60">
                        {format(new Date(invite.sentAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : invite.expiresAt ? (
                          <span className="text-base-content/60">
                            {format(new Date(invite.expiresAt), "MMM d, yyyy")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                resendInvite({
                                  workspaceId,
                                  memberId: invite.id,
                                }),
                              () =>
                                toast.success(
                                  `Invite re-sent to ${invite.email}`
                                )
                            )
                          }
                          size="sm"
                          variant="ghost"
                        >
                          Resend
                        </Button>
                        <Button
                          className="text-error hover:text-error"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              cancelInvite({ workspaceId, memberId: invite.id })
                            )
                          }
                          size="sm"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
