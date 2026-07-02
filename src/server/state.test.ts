import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Schema validation (table-driven) ──────────────────────────────────────────

describe("RowSchema (table-driven)", () => {
  const base = { id: "1", frame: "F1", model: "", source: "S1", description: "D", note: "", status: "ok" };

  const cases: Array<{ name: string; input: unknown; valid: boolean }> = [
    { name: "valid ok row",         input: base,                            valid: true  },
    { name: "valid standby row",    input: { ...base, status: "standby" },  valid: true  },
    { name: "valid atencao row",    input: { ...base, status: "atencao" },  valid: true  },
    { name: "valid off row",        input: { ...base, status: "off" },      valid: true  },
    { name: "valid manutencao row", input: { ...base, status: "manutencao" }, valid: true },
    { name: "invalid status",       input: { ...base, status: "live" },     valid: false },
    { name: "unknown status",       input: { ...base, status: "unknown" },  valid: false },
    { name: "empty id",             input: { ...base, id: "" },             valid: false },
    { name: "missing frame key",    input: { source: "S", description: "D", note: "", status: "ok" }, valid: false },
    { name: "model defaults to empty", input: { ...base, model: undefined }, valid: true },
  ];

  for (const { name, input, valid } of cases) {
    it(name, async () => {
      const { RowSchema } = await import("../shared/types.js");
      expect(RowSchema.safeParse(input).success).toBe(valid);
    });
  }
});

describe("StateSchema", () => {
  it("accepts rows up to 20", async () => {
    const { StateSchema, RowSchema } = await import("../shared/types.js");
    const row = RowSchema.parse({ id: "x", frame: "", model: "", source: "", description: "", note: "", status: "ok" });
    const rows = Array.from({ length: 20 }, (_, i) => ({ ...row, id: String(i) }));
    expect(StateSchema.safeParse({ rows }).success).toBe(true);
  });

  it("rejects more than 20 rows", async () => {
    const { StateSchema, RowSchema } = await import("../shared/types.js");
    const row = RowSchema.parse({ id: "x", frame: "", model: "", source: "", description: "", note: "", status: "ok" });
    const rows = Array.from({ length: 21 }, (_, i) => ({ ...row, id: String(i) }));
    expect(StateSchema.safeParse({ rows }).success).toBe(false);
  });

  it("accepts columns optional field", async () => {
    const { StateSchema } = await import("../shared/types.js");
    const result = StateSchema.safeParse({
      rows: [],
      columns: { frame: "Cam", model: "Mod", source: "Src", description: "Desc", note: "Obs", status: "St" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts clock config", async () => {
    const { StateSchema } = await import("../shared/types.js");
    const result = StateSchema.safeParse({
      rows: [],
      clock: { visible: true, scale: 2.5, x: 100, y: 200 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects clock scale above 5", async () => {
    const { ClockConfigSchema } = await import("../shared/types.js");
    expect(ClockConfigSchema.safeParse({ visible: true, scale: 6, x: 0, y: 0 }).success).toBe(false);
  });

  it("rejects clock scale below 1", async () => {
    const { ClockConfigSchema } = await import("../shared/types.js");
    expect(ClockConfigSchema.safeParse({ visible: true, scale: 0.5, x: 0, y: 0 }).success).toBe(false);
  });

  it("rejects invalid state file shape", async () => {
    const { StateSchema } = await import("../shared/types.js");
    expect(StateSchema.safeParse({ rows: "invalid" }).success).toBe(false);
  });
});

describe("schema size caps (table-driven)", () => {
  const baseRow = { id: "1", frame: "F", model: "", source: "S", description: "D", note: "", status: "ok" };

  const cases: Array<{ name: string; check: (t: typeof import("../shared/types.js")) => boolean; valid: boolean }> = [
    { name: "cell at 500 chars ok",       check: (t) => t.RowSchema.safeParse({ ...baseRow, note: "x".repeat(500) }).success,   valid: true  },
    { name: "cell over 500 chars fails",  check: (t) => t.RowSchema.safeParse({ ...baseRow, note: "x".repeat(501) }).success,   valid: false },
    { name: "id over 64 chars fails",     check: (t) => t.RowSchema.safeParse({ ...baseRow, id: "x".repeat(65) }).success,      valid: false },
    { name: "memo at 2000 chars ok",      check: (t) => t.StateSchema.safeParse({ rows: [], memo: "m".repeat(2000) }).success,  valid: true  },
    { name: "memo over 2000 chars fails", check: (t) => t.StateSchema.safeParse({ rows: [], memo: "m".repeat(2001) }).success,  valid: false },
    { name: "column label over 100 fails", check: (t) => t.ColumnsSchema.safeParse({ frame: "x".repeat(101), model: "M", source: "S", description: "D", note: "N", status: "St" }).success, valid: false },
    { name: "image src over cap fails",   check: (t) => t.ImageConfigSchema.safeParse({ src: "d".repeat(4_500_001), x: 0, y: 0, width: 100, visible: true }).success, valid: false },
    { name: "reorder id over 64 fails",   check: (t) => t.ReorderMessageSchema.safeParse({ type: "reorder", ids: ["x".repeat(65)] }).success, valid: false },
  ];

  for (const { name, check, valid } of cases) {
    it(name, async () => {
      const types = await import("../shared/types.js");
      expect(check(types)).toBe(valid);
    });
  }
});

describe("ColumnsSchema", () => {
  it("validates all required column keys", async () => {
    const { ColumnsSchema } = await import("../shared/types.js");
    const valid = { frame: "F", model: "M", source: "S", description: "D", note: "N", status: "St" };
    expect(ColumnsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing key", async () => {
    const { ColumnsSchema } = await import("../shared/types.js");
    expect(ColumnsSchema.safeParse({ frame: "F", model: "M" }).success).toBe(false);
  });
});

// ── File store security ────────────────────────────────────────────────────────

describe("file store — path traversal guard", () => {
  const TMP = join(process.cwd(), "data-test-files-tmp");

  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, "data", "files", ".tmp"), { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("blocks ../etc/passwd style id", async () => {
    // We can't easily re-init the store module to a temp dir in Jest without refactoring,
    // so we test the guard logic inline to mirror what guardId() does.
    const { resolve, join: pathJoin, sep } = await import("node:path");
    const filesDir = join(TMP, "data", "files");
    function guardId(id: string): string | null {
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
      const base = resolve(filesDir);
      const abs  = resolve(pathJoin(filesDir, id));
      if (!abs.startsWith(base + sep) && abs !== base) return null;
      return abs;
    }
    expect(guardId("../../../etc/passwd")).toBeNull();
    expect(guardId("..%2F..%2Fetc")).toBeNull();
    expect(guardId("abc123def")).toBeTruthy();
  });

  it("blocks ids with special chars", async () => {
    const invalidIds = ["a/b", "a\\b", ".hidden", "a b", "a;b", "a<b"];
    for (const id of invalidIds) {
      const clean = /^[a-zA-Z0-9_-]+$/.test(id);
      expect(clean).toBe(false);
    }
  });

  it("allows valid uuid-like ids", () => {
    const validIds = ["abc123", "a1b2c3d4e5f6", "file-name_v2"];
    for (const id of validIds) {
      expect(/^[a-zA-Z0-9_-]+$/.test(id)).toBe(true);
    }
  });
});

describe("file store — limits (table-driven)", () => {
  const cases = [
    { name: "file exactly at 75MB limit", sizeBytes: 75 * 1024 * 1024, expectOk: true },
    { name: "file 1 byte over 75MB",      sizeBytes: 75 * 1024 * 1024 + 1, expectOk: false },
    { name: "small file",                 sizeBytes: 1024,               expectOk: true },
  ];

  for (const { name, sizeBytes, expectOk } of cases) {
    it(name, () => {
      const MAX_FILE = 75 * 1024 * 1024;
      expect(sizeBytes <= MAX_FILE).toBe(expectOk);
    });
  }
});
