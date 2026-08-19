import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

// Supabase mock (requireAuth loads the token user via .single(), the default
// user via .limit(); the users routes end their chains in .order()/.single()).
const { mockSingle, mockLimit, mockOrder, supabaseMock } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockLimit = vi.fn();
  const mockOrder = vi.fn();
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.order = mockOrder;
  builder.single = mockSingle;
  builder.limit = mockLimit;
  const supabaseMock = { from: vi.fn(() => builder) };
  return { mockSingle, mockLimit, mockOrder, supabaseMock };
});
vi.mock("../src/lib/supabase", () => ({ supabase: supabaseMock, default: supabaseMock }));

import usersRouter from "../src/api/users";
import { resetDefaultUser } from "../src/api/middleware/auth";

const JWT_SECRET = process.env.NEXTAUTH_SECRET as string;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRouter);
  return app;
}

function tokenFor(role: string) {
  mockSingle.mockResolvedValueOnce({
    data: { id: "u1", email: "rep@b.com", role, company_id: null },
    error: null,
  });
  return jwt.sign({ userId: "u1" }, JWT_SECRET, { expiresIn: "1h" });
}

beforeEach(() => {
  mockSingle.mockReset();
  mockLimit.mockReset();
  mockOrder.mockReset();
  // Default (no-token) identity: an ADMIN.
  mockLimit.mockResolvedValue({
    data: [{ id: "admin1", email: "admin@b.com", role: "ADMIN", company_id: null }],
    error: null,
  });
  resetDefaultUser();
});

describe("GET /api/users", () => {
  it("never returns password hashes", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: "u1", email: "a@b.com", name: "A", role: "SALES_REP", password: "$2b$10$hash" },
        { id: "u2", email: "c@d.com", name: "C", role: "ADMIN", password: null },
      ],
      error: null,
    });

    const res = await request(buildApp()).get("/api/users");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const user of res.body) {
      expect(user).not.toHaveProperty("password");
    }
    expect(res.body[0].email).toBe("a@b.com");
  });
});

describe("user mutations are admin-only", () => {
  it("rejects POST from a non-admin", async () => {
    const token = tokenFor("SALES_REP");
    const res = await request(buildApp())
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@b.com", role: "ADMIN" });
    expect(res.status).toBe(403);
  });

  it("rejects DELETE from a non-admin", async () => {
    const token = tokenFor("SALES_REP");
    const res = await request(buildApp())
      .delete("/api/users/u2")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("allows an admin to create a user and strips the password from the reply", async () => {
    // No token → default ADMIN identity; the insert chain resolves via .single().
    mockSingle.mockResolvedValueOnce({
      data: { id: "u9", email: "new@b.com", name: null, role: "SALES_REP", password: null },
      error: null,
    });
    const res = await request(buildApp())
      .post("/api/users")
      .send({ email: "new@b.com" });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("new@b.com");
    expect(res.body).not.toHaveProperty("password");
  });
});
