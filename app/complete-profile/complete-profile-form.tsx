"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { saveUserName } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_NAME } from "@/config/platform";

export function CompleteProfileForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await saveUserName(name);
    if ("error" in res) {
      setError(res.error);
      setSaving(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="h-full overflow-auto flex items-center justify-center bg-base-200/30 p-4">
      <form
        className="bg-base-100 rounded-xl border shadow-sm p-8 max-w-sm w-full space-y-4"
        onSubmit={handleSubmit}
      >
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">Welcome to {PRODUCT_NAME}</h1>
          <p className="text-sm text-base-content/60">
            What should we call you?
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Your name</Label>
          <Input
            autoFocus
            id="profile-name"
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
        <Button
          className="w-full"
          disabled={saving || !name.trim()}
          type="submit"
        >
          Continue
        </Button>
      </form>
    </div>
  );
}
