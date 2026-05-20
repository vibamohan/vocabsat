import { describe, expect, test } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  test("merges conditional class names", () => {
    expect(cn("flex", false && "hidden", "gap-2")).toBe("flex gap-2");
  });

  test("resolves conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
