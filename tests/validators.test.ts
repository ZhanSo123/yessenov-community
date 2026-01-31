import { describe, expect, it } from "vitest";

import {
  FollowToggleSchema,
  PaginationSchema,
  PostCreateSchema,
  validateProfile,
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

  it("validateProfile parses interests from comma string", () => {
    const result = validateProfile({
      username: "user_1",
      interests: "AI, спорт,   дизайн",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.interests).toEqual(["AI", "спорт", "дизайн"]);
    }
  });

  it("validateProfile rejects too many interests", () => {
    const result = validateProfile({
      username: "user_1",
      interests: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INTERESTS");
    }
  });

  it("validateProfile rejects invalid course", () => {
    const result = validateProfile({ username: "user_1", course: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_COURSE");
    }
  });
});
