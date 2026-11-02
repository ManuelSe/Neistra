import { expect, test } from "@playwright/test";
import { performanceBudget } from "./support/performance";

for (const profile of ["0", "1"]) {
  test(`timing profile ${profile} preserves workflows and enforces only requested targets`, () => {
    const previous = process.env.NEISTRA_PERFORMANCE;
    process.env.NEISTRA_PERFORMANCE = profile;
    try {
      performanceBudget(100, 500, "within target");
      if (profile === "1") {
        expect(() => performanceBudget(2600, 2000, "slow battery example")).toThrow();
      } else {
        performanceBudget(2600, 2000, "slow battery example");
      }
      const measurement = JSON.parse(test.info().annotations.at(-1)!.description!);
      expect(measurement).toMatchObject({ actual: 2600, enforced: profile === "1", withinTarget: false });
      expect(() => performanceBudget(NaN, 500, "missing measurement")).toThrow(/finite/);
      expect(() => performanceBudget(-1, 500, "missing event")).toThrow(/finite/);
    } finally {
      if (previous === undefined) delete process.env.NEISTRA_PERFORMANCE;
      else process.env.NEISTRA_PERFORMANCE = previous;
    }
  });
}
