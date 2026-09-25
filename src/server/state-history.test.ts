import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_CWD = process.cwd();
const TMP = mkdtempSync(join(tmpdir(), "bid-state-history-"));
const row = (id: string) => ({ id, frame: `F${id}`, model: "", source: "", description: "", note: "", status: "ok" });

beforeAll(() => {
  mkdirSync(join(TMP, "data"));
  writeFileSync(join(TMP, "data", "state.json"), JSON.stringify({ rows: [row("a"), row("b")] }));
  process.chdir(TMP);
});

afterAll(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(TMP, { recursive: true, force: true });
});

describe("state history", () => {
  it("snapshots the previous table before a row-count decrease", async () => {
    const { loadState, saveState, flushStateSync } = await import("./state.js");
    const current = loadState();
    saveState({ ...current, rows: [] });
    flushStateSync();

    const historyDir = join(TMP, "data", "history");
    const backups = readdirSync(historyDir).filter((name) => name.endsWith(".json"));
    expect(backups).toHaveLength(1);
    const saved = JSON.parse(readFileSync(join(historyDir, backups[0]!), "utf8"));
    expect(saved.rows.map((r: { id: string }) => r.id)).toEqual(["a", "b"]);
    expect(JSON.parse(readFileSync(join(TMP, "data", "state.json"), "utf8")).rows).toEqual([]);
  });
});
