import assert from "node:assert/strict";
import test from "node:test";

import { distanceInKm } from "../src/server/distance.ts";

test("distance is zero for identical coordinates", () => {
  assert.equal(distanceInKm(-0.3935871, 37.1322716, -0.3935871, 37.1322716), 0);
});

test("distance uses great-circle kilometres and is symmetric", () => {
  const eastward = distanceInKm(0, 0, 0, 1);
  const westward = distanceInKm(0, 1, 0, 0);

  assert.ok(Math.abs(eastward - 111.195) < 0.02);
  assert.equal(eastward, westward);
});

test("distance remains finite for antipodal points", () => {
  assert.ok(Number.isFinite(distanceInKm(0, 0, 0, 180)));
});
