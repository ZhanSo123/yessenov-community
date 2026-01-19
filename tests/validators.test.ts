import { describe, expect, it } from "vitest";

import {
  FollowToggleSchema,
  PaginationSchema,
  PostCreateSchema,
} from "../src/lib/validators";

describe("validators", () => {
  it("PostCreateSchema rejects empty content", () => {
    const result = PostCreateSchema.safeParse({ content: "   " });
    expect(result.success).toBe(false);
  });

  it("FollowToggleSchema accepts lowercase username", () => {
    const result = FollowToggleSchema.safeParse({ username: "user_1" });
    expect(result.success).toBe(true);
  });

  it("PaginationSchema coerces limit", () => {
    const result = PaginationSchema.safeParse({ limit: "20", cursor: "abc" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });
});
