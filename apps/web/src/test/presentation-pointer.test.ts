import { expect, it } from "vitest";
import { presentationPoint } from "../presentation/pointer";

it("maps normalized points into wide and tall contained source images", () => {
  expect(presentationPoint({ x: 0.25, y: 0.75 }, 1000, 1000, 1000, 500)).toEqual({ x: 250, y: 625 });
  expect(presentationPoint({ x: 0.25, y: 0.75 }, 1000, 500, 500, 1000)).toEqual({ x: 437.5, y: 375 });
  expect(presentationPoint({ x: 0.5, y: 0.5 }, 640, 480, 640, 480)).toEqual({ x: 320, y: 240 });
});

it("does not display invalid, out-of-canvas or unavailable-source points", () => {
  expect(presentationPoint({ x: NaN, y: 0 }, 640, 480, 640, 480)).toBeNull();
  expect(presentationPoint({ x: 2, y: 0 }, 640, 480, 640, 480)).toBeNull();
  expect(presentationPoint({ x: 0.5, y: 0.5 }, 640, 480, 0, 0)).toBeNull();
});
