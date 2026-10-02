"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateWorkspaceMemberLimits } from "@/app/actions/workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  MAX_MEMBER_LIMIT,
  MIN_GUEST_LIMIT,
  MIN_MEMBER_LIMIT,
} from "@/lib/member-limit";

interface Bucket {
  limit: number | null;
  used: number;
}

interface MemberLimitsSettingsFormProps {
  guests: Bucket;
  members: Bucket;
  workspaceId: string;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, singular: string, pluralWord: string) =>
  `${fmt(n)} ${n === 1 ? singular : pluralWord}`;

interface LimitSectionProps {
  /** "member" | "guest" — drives copy. */
  kind: "member" | "guest";
  min: number;
  onToggleUnlimited: (unlimited: boolean) => void;
  onValueChange: (value: string) => void;
  saved: Bucket;
  unlimited: boolean;
  value: string;
}

function LimitSection({
  kind,
  min,
  saved,
  unlimited,
  value,
  onToggleUnlimited,
  onValueChange,
}: LimitSectionProps) {
  const noun = kind === "guest" ? "guest" : "member";
  const nouns = kind === "guest" ? "guests" : "members";
  const id = `${kind}-limit`;

  const parsed = value.trim() === "" ? null : Number(value);
  const valid =
    unlimited ||
    (parsed !== null &&
      Number.isInteger(parsed) &&
      parsed >= min &&
      parsed <= MAX_MEMBER_LIMIT);
  const belowUsage =
    !unlimited && valid && parsed !== null && parsed < saved.used;

  // Usage reflects the *saved* limit, not the unsaved input.
  const percentUsed =
    saved.limit === null
      ? 0
      : saved.limit === 0
        ? saved.used > 0
          ? 100
          : 0
        : Math.round((saved.used / saved.limit) * 100);
  const remaining =
    saved.limit === null ? null : Math.max(0, saved.limit - saved.used);
  const overBy =
    saved.limit !== null && saved.used > saved.limit
      ? saved.used - saved.limit
      : 0;

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-base-content/60 text-xs uppercase tracking-wider">
        {kind === "guest" ? "Guests" : "Members"}
      </h3>
      <div className="space-y-2 rounded-xl border border-base-300 bg-base-200/40 p-4">
        {saved.limit === null ? (
          <p className="flex items-baseline gap-1.5">
            <span className="font-semibold text-2xl tabular-nums">
              {fmt(saved.used)}
            </span>
            <span className="text-sm text-base-content/60">
              {saved.used === 1 ? noun : nouns} · No limit
            </span>
          </p>
        ) : (
          <>
            <p className="flex items-baseline gap-1.5">
              <span className="font-semibold text-2xl tabular-nums">
                {fmt(saved.used)}
              </span>
              <span className="text-sm text-base-content/60">
                / {fmt(saved.limit)} {nouns}
              </span>
            </p>
            <Progress className="h-2" value={Math.min(100, percentUsed)} />
            <p className="text-xs text-base-content/60">
              {percentUsed}% used ·{" "}
              {overBy > 0
                ? `${plural(overBy, noun, nouns)} over limit`
                : `${plural(remaining ?? 0, noun, nouns)} remaining`}
            </p>
            {overBy > 0 && (
              <Alert className="rounded-xl after:hidden" variant="warning">
                <WarningIcon />
                <AlertTitle>Over the {noun} limit</AlertTitle>
                <AlertDescription>
                  This workspace is {plural(overBy, noun, nouns)} over its
                  limit. Existing {nouns} are unaffected, but new invitations
                  and joins are blocked until usage falls below{" "}
                  {fmt(saved.limit)} or the limit is increased.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={`${id}-unlimited`}>Unlimited {nouns}</Label>
          <p className="text-xs text-base-content/60">
            Turn on to remove the {noun} limit.
          </p>
        </div>
        <Switch
          checked={unlimited}
          id={`${id}-unlimited`}
          onCheckedChange={onToggleUnlimited}
        />
      </div>

      {!unlimited && (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {kind === "guest" ? "Guest Limit" : "Member Limit"}
          </Label>
          <Input
            className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            id={id}
            inputMode="numeric"
            max={MAX_MEMBER_LIMIT}
            min={min}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={kind === "guest" ? "5" : "25"}
            step={1}
            type="number"
            value={value}
          />
          {kind === "guest" && (
            <p className="text-xs text-base-content/60">
              Use 0 to disallow guests.
            </p>
          )}
          {!valid && value.trim() !== "" && (
            <p className="text-xs text-error">
              Enter a whole number between {fmt(min)} and{" "}
              {fmt(MAX_MEMBER_LIMIT)}.
            </p>
          )}
          {belowUsage && (
            <p className="text-xs text-warning">
              This is below current usage ({fmt(saved.used)}). Existing {nouns}{" "}
              are kept, but no new {nouns} can join until usage drops below the
              limit.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function MemberLimitsSettingsForm({
  workspaceId,
  members,
  guests,
}: MemberLimitsSettingsFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [membersUnlimited, setMembersUnlimited] = useState(
    members.limit === null
  );
  const [membersValue, setMembersValue] = useState(
    members.limit === null ? "" : String(members.limit)
  );
  const [guestsUnlimited, setGuestsUnlimited] = useState(guests.limit === null);
  const [guestsValue, setGuestsValue] = useState(
    guests.limit === null ? "" : String(guests.limit)
  );

  const parse = (unlimited: boolean, value: string, min: number) => {
    if (unlimited) {
      return { valid: true, value: null as number | null };
    }
    const n = value.trim() === "" ? Number.NaN : Number(value);
    return {
      valid: Number.isInteger(n) && n >= min && n <= MAX_MEMBER_LIMIT,
      value: n,
    };
  };
  const m = parse(membersUnlimited, membersValue, MIN_MEMBER_LIMIT);
  const g = parse(guestsUnlimited, guestsValue, MIN_GUEST_LIMIT);
  const dirty = m.value !== members.limit || g.value !== guests.limit;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateWorkspaceMemberLimits({
        workspaceId,
        maxMembers: m.value,
        maxGuests: g.value,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Member limits updated");
      router.refresh();
    });
  }

  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="normal-case tracking-normal text-base font-semibold">
          Member &amp; Guest Limits
        </CardTitle>
        <CardDescription>
          Control how many members and guests this workspace can hold.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSave}>
          <div className="grid gap-5 md:grid-cols-2 md:gap-0 md:divide-x md:divide-base-300 [&>section]:md:px-6 [&>section:first-child]:md:pl-0 [&>section:last-child]:md:pr-0 max-md:divide-y max-md:divide-base-300 [&>section:last-child]:max-md:pt-5">
            <LimitSection
              kind="member"
              min={MIN_MEMBER_LIMIT}
              onToggleUnlimited={setMembersUnlimited}
              onValueChange={setMembersValue}
              saved={members}
              unlimited={membersUnlimited}
              value={membersValue}
            />
            <LimitSection
              kind="guest"
              min={MIN_GUEST_LIMIT}
              onToggleUnlimited={setGuestsUnlimited}
              onValueChange={setGuestsValue}
              saved={guests}
              unlimited={guestsUnlimited}
              value={guestsValue}
            />
          </div>

          <p className="text-xs text-base-content/60">
            Members include Owners and Admins. Pending invitations count toward
            the limit until they expire. Removing a member or cancelling an
            invite frees a seat. Existing people are never removed when a limit
            is lowered.
          </p>

          <Button
            className="gap-2"
            disabled={pending || !m.valid || !g.valid || !dirty}
            type="submit"
          >
            {pending && <Spinner className="size-4" />}
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
