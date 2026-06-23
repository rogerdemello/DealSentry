import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

// Supabase mock (requireAuth loads the user via .single()).
const { mockSingle, supabaseMock } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = mockSingle;
  const supabaseMock = { from: vi.fn(() => builder) };
  return { mockSingle, supabaseMock };
});
vi.mock("../src/lib/supabase", () => ({ supabase: supabaseMock, default: supabaseMock }));

// Mock the scoped-query helper so the route's unread-count logic is isolated.
const { getScopedAuditLogs } = vi.hoisted(() => ({ getScopedAuditLogs: vi.fn() }));
vi.mock("../src/api/lib/auditQuery", () => ({ getScopedAuditLogs }));

import notificationsRouter from "../src/api/notifications";

const JWT_SECRET = process.env.NEXTAUTH_SECRET as string;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/notifications", notificationsRouter);
  return app;
}

function authedUser() {
  mockSingle.mockResolvedValue({
    data: { id: "u1", email: "a@b.com", role: "SALES_REP", company_id: "c1" },
    error: null,
  });
  return jwt.sign({ userId: "u1" }, JWT_SECRET, { expiresIn: "1h" });
}

const log = (id: string, isoOffsetMin: number) => ({
  id,
  action: "Changed status",
  timestamp: new Date(Date.UTC(2026, 5, 22, 12, 0) - isoOffsetMin * 60_000).toISOString(),
  actorId: "u2",
  actor: { name: "Bob", email: "bob@b.com", role: "ADMIN" },
  proposalId: "p1",
  proposal: { title: "Acme" },
});

beforeEach(() => {
  mockSingle.mockReset();
  getScopedAuditLogs.mockReset();
});

describe("GET /api/notifications", () => {
  it("401 without a token", async () => {
    const res = await request(buildApp()).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("returns all items as unread when no `since` is given", async () => {
    const token = authedUser();
    getScopedAuditLogs.mockResolvedValue([log("a", 5), log("b", 60)]);
    const res = await request(buildApp())
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.unreadCount).toBe(2);
  });

  it("counts only items newer than `since` as unread", async () => {
    const token = authedUser();
    // 'a' is 5 min before noon, 'b' is 60 min before noon.
    getScopedAuditLogs.mockResolvedValue([log("a", 5), log("b", 60)]);
    const since = new Date(Date.UTC(2026, 5, 22, 11, 30)).toISOString(); // 30 min before noon
    const res = await request(buildApp())
      .get(`/api/notifications?since=${encodeURIComponent(since)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    // only 'a' (5 min before noon) is newer than 11:30
    expect(res.body.unreadCount).toBe(1);
  });
});
