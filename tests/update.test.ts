import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkForUpdate } from "../extensions/idevflow/ui/update.ts";

describe("update notification", () => {
  it("reports a different beta dist-tag without project data", async () => {
    let url = "";
    const status = await checkForUpdate(async (input) => {
      url = input;
      return { ok: true, json: async () => ({ "dist-tags": { beta: "0.3.0-beta.5" } }) };
    });
    assert.equal(url, "https://registry.npmjs.org/idevflow");
    assert.equal(status.available, "0.3.0-beta.5");
  });
});
