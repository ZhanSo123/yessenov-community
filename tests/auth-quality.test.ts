import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { setAuthOverride } from "../src/lib/auth-session";

const prismaMock = {
  post: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  follow: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  like: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

describe("API auth quality gate", () => {
  beforeAll(() => {
    (globalThis as { prisma?: Record<string, unknown> }).prisma = prismaMock;
  });

  beforeEach(() => {
    setAuthOverride(async () => null);
  });

  afterEach(() => {
    setAuthOverride(null);
    vi.clearAllMocks();
  });

  it("GET /api/feed?mode=for-you returns 200", async () => {
    prismaMock.post.findMany.mockResolvedValue([]);

    const { GET } = await import("../src/app/api/feed/route");
    const response = await GET(
      new Request("http://localhost/api/feed?mode=for-you")
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toEqual([]);
  });

  it("GET /api/feed?mode=following without session returns 401", async () => {
    setAuthOverride(async () => null);

    const { GET } = await import("../src/app/api/feed/route");
    const response = await GET(
      new Request("http://localhost/api/feed?mode=following")
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toEqual({ error: "UNAUTHORIZED" });
  });

  it("POST /api/posts without session returns 401", async () => {
    setAuthOverride(async () => null);

    const { POST } = await import("../src/app/api/posts/route");
    const response = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello" }),
      })
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toEqual({ error: "UNAUTHORIZED" });
  });

  it("POST /api/likes/toggle without session returns 401", async () => {
    const { POST } = await import("../src/app/api/likes/toggle/route");
    const response = await POST(
      new Request("http://localhost/api/likes/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: 1 }),
      })
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toEqual({ error: "UNAUTHORIZED" });
  });

  it("POST /api/follow/toggle without session returns 401", async () => {
    const { POST } = await import("../src/app/api/follow/toggle/route");
    const response = await POST(
      new Request("http://localhost/api/follow/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "demo" }),
      })
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toEqual({ error: "UNAUTHORIZED" });
  });

  it("requireUser() returns 401 for API mode", async () => {
    setAuthOverride(async () => null);

    const { requireUser } = await import("../src/lib/auth");

    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });

  it("apiError() uses standardized JSON format", async () => {
    const { apiError } = await import("../src/lib/api-errors");
    const response = apiError("UNAUTHORIZED", 401);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toEqual({ error: "UNAUTHORIZED" });
  });
});
