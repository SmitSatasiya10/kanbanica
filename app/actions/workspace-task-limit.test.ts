import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, membershipMock, refreshMock, setMock, whereMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    membershipMock: vi.fn(),
    refreshMock: vi.fn(),
    setMock: vi.fn(),
    whereMock: vi.fn(),
  }));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => ({ set: setMock })),
  },
}));
vi.mock("@/lib/permissions", () => ({
  getWorkspaceMembership: membershipMock,
}));
vi.mock("@/lib/realtime/refresh", () => ({ refreshWorkspace: refreshMock }));
vi.mock("@/lib/email", () => ({ enqueueEmail: vi.fn() }));
vi.mock("@/lib/email/templates/workspace-invite", () => ({
  workspaceInviteTemplate: vi.fn(),
}));
vi.mock("@/lib/notifications/create-notification", () => ({
  createNotifications: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: {} }));

import { updateWorkspaceTaskLimit } from "@/app/actions/workspace";

beforeEach(() => {
  getSessionMock.mockReset().mockResolvedValue({ user: { id: "u1" } });
  membershipMock.mockReset();
  refreshMock.mockReset();
  whereMock.mockReset().mockResolvedValue(undefined);
  setMock.mockReset().mockReturnValue({ where: whereMock });
});

describe("updateWorkspaceTaskLimit — permissions", () => {
  it.each(["OWNER", "ADMIN"])(
    "%s can set the limit and the workspace refreshes",
    async (role) => {
      membershipMock.mockResolvedValue({ role });
      const result = await updateWorkspaceTaskLimit({
        workspaceId: "ws-1",
        maxTasks: 10_000,
      });
      expect(result).toEqual({ ok: true });
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxTasks: 10_000 })
      );
      expect(refreshMock).toHaveBeenCalledWith("ws-1");
    }
  );

  it.each(["MEMBER", "GUEST"])(
    "%s is rejected and nothing is written",
    async (role) => {
      membershipMock.mockResolvedValue({ role });
      const result = await updateWorkspaceTaskLimit({
        workspaceId: "ws-1",
        maxTasks: 10,
      });
      expect(result).toEqual({
        error: "Only admins can change the task limit",
      });
      expect(setMock).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
    }
  );

  it("non-member (no active membership) is rejected", async () => {
    membershipMock.mockResolvedValue(null);
    const result = await updateWorkspaceTaskLimit({
      workspaceId: "ws-1",
      maxTasks: 10,
    });
    expect(result).toEqual({ error: "Only admins can change the task limit" });
    expect(setMock).not.toHaveBeenCalled();
  });

  it("unauthenticated callers are rejected", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(
      await updateWorkspaceTaskLimit({ workspaceId: "ws-1", maxTasks: 10 })
    ).toEqual({ error: "Unauthorized" });
    expect(setMock).not.toHaveBeenCalled();
  });
});

describe("updateWorkspaceTaskLimit — values", () => {
  beforeEach(() => membershipMock.mockResolvedValue({ role: "ADMIN" }));

  it("null means unlimited", async () => {
    expect(
      await updateWorkspaceTaskLimit({ workspaceId: "ws-1", maxTasks: null })
    ).toEqual({ ok: true });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxTasks: null })
    );
  });

  it.each([1, 10_000_000])("accepts boundary value %p", async (maxTasks) => {
    expect(
      await updateWorkspaceTaskLimit({ workspaceId: "ws-1", maxTasks })
    ).toEqual({ ok: true });
  });

  it.each([0, -5, 2.5, 10_000_001, Number.NaN])(
    "rejects invalid value %p without writing",
    async (maxTasks) => {
      const result = await updateWorkspaceTaskLimit({
        workspaceId: "ws-1",
        maxTasks,
      });
      expect(result).toHaveProperty("error");
      expect(setMock).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
    }
  );

  it("lowering below current usage is allowed — only maxTasks (+updatedAt) is written, no task rows are touched", async () => {
    // The action never queries usage and only updates the workspace row.
    expect(
      await updateWorkspaceTaskLimit({ workspaceId: "ws-1", maxTasks: 5000 })
    ).toEqual({ ok: true });
    expect(Object.keys(setMock.mock.calls[0][0]).sort()).toEqual([
      "maxTasks",
      "updatedAt",
    ]);
  });
});
