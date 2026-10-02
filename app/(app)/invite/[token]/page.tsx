"use client";

import {
  CheckCircleIcon,
  SpinnerGapIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  acceptInvite,
  declineInvite,
  getInviteState,
  type InviteErrorCode,
} from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";

const ERROR_TITLES: Record<InviteErrorCode, string> = {
  auth_required: "Sign in required",
  invalid: "Invitation invalid",
  expired: "Invitation expired",
  used: "Invitation unavailable",
  wrong_user: "Wrong account",
  rate_limited: "Too many attempts",
};

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "declining" | "success" | "declined" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [errorCode, setErrorCode] = React.useState<InviteErrorCode>("invalid");
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [token, setToken] = React.useState("");
  // Synchronous in-flight locks — a rapid double click/tap can fire the
  // handler twice before the `disabled` prop takes effect on the next
  // render, which would submit the (single-use) token twice.
  const acceptingRef = React.useRef(false);
  const decliningRef = React.useRef(false);

  React.useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  // Resolve the link's state up front, so an invite this user already accepted
  // (refresh, reopened link, auto-activated at sign-in) goes straight to the
  // workspace instead of surfacing as an error.
  React.useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    getInviteState(token).then((res) => {
      if (cancelled) {
        return;
      }
      if (res.state === "accepted") {
        setWorkspaceId(res.workspaceId);
        setStatus("success");
        router.replace(`/${res.workspaceId}`);
      } else if (res.state === "error") {
        if (res.code === "auth_required") {
          router.replace("/login");
          return;
        }
        setErrorCode(res.code);
        setErrorMsg(res.error);
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  async function handleAccept() {
    if (!token || acceptingRef.current) {
      return;
    }
    acceptingRef.current = true;
    setStatus("loading");
    try {
      const res = await acceptInvite(token);
      if ("error" in res) {
        setStatus("error");
        setErrorMsg(res.error);
        setErrorCode(res.code);
      } else {
        setWorkspaceId(res.workspaceId);
        setStatus("success");
        router.replace(`/${res.workspaceId}`);
      }
    } finally {
      acceptingRef.current = false;
    }
  }

  async function handleDecline() {
    if (!token || decliningRef.current) {
      return;
    }
    decliningRef.current = true;
    setStatus("declining");
    try {
      const res = await declineInvite(token);
      if ("error" in res) {
        setStatus("error");
        setErrorMsg(res.error);
      } else {
        setStatus("declined");
      }
    } finally {
      decliningRef.current = false;
    }
  }

  if (status === "success") {
    return (
      <div className="h-full overflow-auto flex items-center justify-center bg-base-200/30 p-4">
        <div className="bg-base-100 rounded-xl border shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <CheckCircleIcon
            className="size-12 text-green-500 mx-auto"
            weight="fill"
          />
          <h1 className="text-lg font-semibold">You&rsquo;re in!</h1>
          <p className="text-sm text-base-content/60">
            You&rsquo;ve successfully joined the workspace.
          </p>
          <Button
            className="w-full"
            onClick={() => router.push(`/${workspaceId}`)}
          >
            Go to workspace
          </Button>
        </div>
      </div>
    );
  }

  if (status === "declined") {
    return (
      <div className="h-full overflow-auto flex items-center justify-center bg-base-200/30 p-4">
        <div className="bg-base-100 rounded-xl border shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <XCircleIcon
            className="size-12 text-base-content/60 mx-auto"
            weight="fill"
          />
          <h1 className="text-lg font-semibold">Invitation declined</h1>
          <p className="text-sm text-base-content/60">
            You&rsquo;ve declined this workspace invitation.
          </p>
          <Button
            className="w-full"
            onClick={() => router.push("/")}
            variant="outline"
          >
            Go home
          </Button>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="h-full overflow-auto flex items-center justify-center bg-base-200/30 p-4">
        <div className="bg-base-100 rounded-xl border shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <XCircleIcon className="size-12 text-error mx-auto" weight="fill" />
          <h1 className="text-lg font-semibold">{ERROR_TITLES[errorCode]}</h1>
          <p className="text-sm text-base-content/60">{errorMsg}</p>
          <Button
            className="w-full"
            onClick={() => router.push("/")}
            variant="outline"
          >
            Go home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto flex items-center justify-center bg-base-200/30 p-4">
      <div className="bg-base-100 rounded-xl border shadow-sm p-8 max-w-sm w-full text-center space-y-4">
        <h1 className="text-lg font-semibold">Workspace invitation</h1>
        <p className="text-sm text-base-content/60">
          You&rsquo;ve been invited to join a workspace. Click below to accept.
        </p>
        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={status === "loading" || status === "declining" || !token}
            onClick={handleAccept}
          >
            {status === "loading" ? (
              <span className="flex items-center gap-2">
                <SpinnerGapIcon className="size-4 animate-spin" />
                Accepting…
              </span>
            ) : (
              "Accept invitation"
            )}
          </Button>
          <Button
            className="w-full"
            disabled={status === "loading" || status === "declining" || !token}
            onClick={handleDecline}
            variant="outline"
          >
            {status === "declining" ? (
              <span className="flex items-center gap-2">
                <SpinnerGapIcon className="size-4 animate-spin" />
                Declining…
              </span>
            ) : (
              "Decline"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
