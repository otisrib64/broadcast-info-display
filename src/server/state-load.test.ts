import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ROWS } from "../shared/types.js";

// state.ts resolves data/state.json from process.cwd() at import time.
const ORIGINAL_CWD = process.cwd();
const TMP = mkdtempSync(join(tmpdir(), "bid-state-"));

beforeAll(() => {
  mkdirSync(join(TMP, "data"));
  process.chdir(TMP);
});

afterAll(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(TMP, { recursive: true, force: true });
});

describe("loadState — state saved under an older, higher row cap", () => {
  it("keeps the first MAX_ROWS rows and backs up the original file", async () => {
    const rows = Array.from({ length: MAX_ROWS + 8 }, (_, i) => ({
      id: String(i), frame: `F${i}`, model: "", source: "", description: "", note: "", status: "ok",
    }));
    const original = JSON.stringify({ rows, memo: "keep me" });
    writeFileSync(join(TMP, "data", "state.json"), original);

    const { loadState } = await import("./state.js");
    const state = loadState();

    expect(state.rows.map((r) => r.id)).toEqual(rows.slice(0, MAX_ROWS).map((r) => r.id));
    expect(state.memo).toBe("keep me");
    const backups = readdirSync(join(TMP, "data")).filter((f) => f.startsWith("state.json.bak-"));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(TMP, "data", backups[0]!), "utf8")).toBe(original);
  });
});
