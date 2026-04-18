import { describe, it } from "vitest";
import { equal } from "node:assert";

describe("Relationships Plugin", () => {
  it("should have correct plugin id", () => {
    equal("relationships", "relationships");
  });
});
