import assert from "node:assert/strict";
import test from "node:test";

import { modelForTask, tierForTask } from "../lib/ai/models.ts";

test("basit işler 4o katmanına yönlenir", () => {
  assert.equal(tierForTask("conversation"), "standard");
  assert.equal(tierForTask("structured_extraction"), "cheap");
  assert.equal(tierForTask("vision"), "standard");
  assert.equal(modelForTask("conversation"), process.env.OPENAI_MODEL_STANDARD || "gpt-4o");
  assert.equal(modelForTask("structured_extraction"), process.env.OPENAI_MODEL_CHEAP || "gpt-4o");
});

test("plan ve karmaşık değerlendirme güçlü modele yönlenir", () => {
  assert.equal(tierForTask("plan_generation"), "advanced");
  assert.equal(tierForTask("complex_reasoning"), "advanced");
  assert.equal(modelForTask("plan_generation"), process.env.OPENAI_MODEL_ADVANCED || "gpt-5.1");
});
