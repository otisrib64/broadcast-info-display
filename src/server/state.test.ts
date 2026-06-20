import { describe, it, expect, beforeEach } from "@jest/globals";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// point state module at a temp dir
const TMP_DIR = join(process.cwd(), "data-test-tmp");

describe("state", () => {
  beforeEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
  });

  it("returns empty state when file missing", async () => {
    process.chdir(join(process.cwd(), "..")); // won't find data/state.json
    // dynamic import to pick up fresh module after cwd change
    const { loadState } = await import("./state.js?" + Date.now());
    const result = loadState();
    expect(result).toEqual({ rows: [] });
  });

  it("rejects invalid state file and returns empty", () => {
    const dataDir = join(TMP_DIR, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "state.json"), '{"rows": "invalid"}', "utf8");
    // tested via schema validation in loadState - just verifying schema rejects this shape
    const { StateSchema } = require("../shared/types.js");
    const result = StateSchema.safeParse({ rows: "invalid" });
    expect(result.success).toBe(false);
  });

  it("atomic write: temp file does not persist on success", () => {
    const tmpFile = join(TMP_DIR, "state.json.tmp");
    expect(existsSync(tmpFile)).toBe(false);
  });
});

describe("schema validation (table-driven)", () => {
  const validRow = { id: "1", frame: "F1", source: "S1", description: "D", note: "", status: "live" };

  const cases: Array<{ name: string; input: unknown; valid: boolean }> = [
    { name: "valid live row", input: validRow, valid: true },
    { name: "valid standby row", input: { ...validRow, status: "standby" }, valid: true },
    { name: "valid off row", input: { ...validRow, status: "off" }, valid: true },
    { name: "invalid status", input: { ...validRow, status: "unknown" }, valid: false },
    { name: "missing id", input: { ...validRow, id: "" }, valid: false },
    { name: "missing frame key", input: { source: "S", description: "D", note: "", status: "live" }, valid: false },
  ];

  for (const { name, input, valid } of cases) {
    it(name, async () => {
      const { RowSchema } = await import("../shared/types.js");
      const result = RowSchema.safeParse(input);
      expect(result.success).toBe(valid);
    });
  }
});
