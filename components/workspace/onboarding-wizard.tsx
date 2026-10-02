"use client";

import {
  ArrowRightIcon,
  BuildingsIcon,
  StackIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createOnboardingSpace,
  createOnboardingWorkspace,
  saveUserName,
} from "@/app/actions/onboarding";
import { EmojiPickerPopover } from "@/components/common/emoji-picker-popover";
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
import { cn } from "@/lib/utils";

const LOGO_EMOJIS = ["🚀", "🏢", "⭐", "🎯", "💼", "🔥", "🛠️", "📈", "🎨", "🌱"];

const SPACE_COLORS = [
  "#6366F1",
  "#3B82F6",
  "#06B6D4",
  "#22C55E",
  "#EAB308",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#8B5CF6",
];

interface OnboardingWizardProps {
  existingWorkspace: { id: string; name: string } | null;
  userName: string;
}

export function OnboardingWizard({
  existingWorkspace,
  userName,
}: OnboardingWizardProps) {
  // Step 0 = collect name (only if blank), Step 1 = workspace, Step 2 = space
  const needsName = !userName.trim();
  const [step, setStep] = useState<"name" | "workspace" | "space">(
    needsName ? "name" : existingWorkspace ? "space" : "workspace"
  );

  const [workspaceState, setWorkspaceState] = useState(existingWorkspace);
  const [pending, startTransition] = useTransition();

  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [logoEmoji, setLogoEmoji] = useState<string | null>(null);

  const [spaceName, setSpaceName] = useState("");
  const [spaceColor, setSpaceColor] = useState(SPACE_COLORS[0]);
  const [spaceLogoEmoji, setSpaceLogoEmoji] = useState<string | null>(null);

  function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveUserName(displayName);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setStep("workspace");
    });
  }

  function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createOnboardingWorkspace({
        name: workspaceName,
        logoEmoji,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setWorkspaceState({ id: result.workspaceId, name: workspaceName.trim() });
      setStep("space");
    });
  }

  function handleCreateSpace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceState) {
      return;
    }
    startTransition(async () => {
      const result = await createOnboardingSpace({
        workspaceId: workspaceState.id,
        name: spaceName,
        color: spaceColor,
        logoEmoji: spaceLogoEmoji,
      });
      if (result && "error" in result) {
        toast.error(result.error);
      }
    });
  }

  // ── Step 0: collect name ──────────────────────────────────────────────────
  if (step === "name") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <UserIcon className="size-5 text-primary" weight="duotone" />
          </div>
          <CardTitle className="text-xl">What's your name?</CardTitle>
          <CardDescription>
            This is how teammates will see you across the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSaveName}>
            <div className="space-y-2">
              <Label htmlFor="display-name">Full name</Label>
              <Input
                autoFocus
                id="display-name"
                maxLength={100}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Elena Rossi"
                required
                value={displayName}
              />
            </div>
            <Button
              className="w-full gap-2"
              disabled={pending || displayName.trim().length < 2}
              type="submit"
            >
              <ArrowRightIcon className="size-4" />
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // ── Step 1: create workspace ──────────────────────────────────────────────
  if (step === "workspace") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BuildingsIcon className="size-5 text-primary" weight="duotone" />
          </div>
          <CardTitle className="text-xl">Create your Workspace</CardTitle>
          <CardDescription>
            Your Workspace is your company or team's home. Everything your team
            works on lives here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleCreateWorkspace}>
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                autoFocus
                id="workspace-name"
                maxLength={100}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Acme Inc"
                required
                value={workspaceName}
              />
            </div>

            <div className="space-y-2">
              <Label>
                Logo{" "}
                <span className="font-normal text-base-content/60">
                  (optional)
                </span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {LOGO_EMOJIS.map((emoji) => (
                  <button
                    aria-pressed={logoEmoji === emoji}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors hover:bg-base-200",
                      logoEmoji === emoji && "border-primary bg-primary/10"
                    )}
                    key={emoji}
                    onClick={() =>
                      setLogoEmoji(logoEmoji === emoji ? null : emoji)
                    }
                    type="button"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full gap-2"
              disabled={pending || !workspaceName.trim()}
              type="submit"
            >
              <ArrowRightIcon className="size-4" />
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // ── Step 2: create first space ────────────────────────────────────────────
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <StackIcon className="size-5 text-primary" weight="duotone" />
        </div>
        <CardTitle className="text-xl">Create your first Project</CardTitle>
        <CardDescription>
          A Project is where your team's work lives — like a department or team
          area. You can create more later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleCreateSpace}>
          <div className="space-y-2">
            <Label htmlFor="space-name">Project name</Label>
            <div className="flex items-center gap-2">
              <EmojiPickerPopover
                color={spaceColor}
                onChange={setSpaceLogoEmoji}
                value={spaceLogoEmoji}
              />
              <Input
                autoFocus
                id="space-name"
                maxLength={100}
                onChange={(e) => setSpaceName(e.target.value)}
                placeholder="e.g. Product, Engineering, Design"
                required
                value={spaceName}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {SPACE_COLORS.map((color) => (
                <button
                  aria-pressed={spaceColor === color}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                    spaceColor === color
                      ? "border-base-content scale-110"
                      : "border-transparent"
                  )}
                  key={color}
                  onClick={() => setSpaceColor(color)}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </div>

          <Button
            className="w-full gap-2"
            disabled={pending || !spaceName.trim()}
            type="submit"
          >
            <ArrowRightIcon className="size-4" />
            Create Project &amp; continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
