import { describe, expect, it } from "vitest";
import { mapLimit } from "./map-limit";

describe("mapLimit", () => {
  it("сохраняет порядок результатов и не превышает лимит параллельности", async () => {
    let active = 0;
    let maxActive = 0;
    const result = await mapLimit([30, 10, 20, 5, 15], 2, async (ms) => {
      maxActive = Math.max(maxActive, ++active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return ms * 2;
    });
    expect(result).toEqual([60, 20, 40, 10, 30]);
    expect(maxActive).toBe(2);
  });

  it("работает с пустым списком", async () => {
    await expect(mapLimit([], 5, () => Promise.resolve(1))).resolves.toEqual([]);
  });
});
