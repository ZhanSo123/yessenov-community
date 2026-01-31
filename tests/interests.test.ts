import { describe, expect, it } from "vitest";

import {
  FACULTY_INTERESTS,
  suggestInterestsByFaculty,
} from "../src/lib/faculty-interests";
import { suggestInterestsFromProfile } from "../src/lib/interests";

describe("interest suggestions", () => {
  it("suggestInterestsByFaculty matches by code", () => {
    const first = FACULTY_INTERESTS[0];
    const result = suggestInterestsByFaculty(first.code);
    expect(result.length).toBeGreaterThan(0);
    first.interests.forEach((item) => {
      expect(result).toContain(item);
    });
  });

  it("suggestInterestsFromProfile adds career for senior course", () => {
    const result = suggestInterestsFromProfile({ faculty: "FIT", course: 4 });
    expect(result).toContain("Карьера");
  });
});
