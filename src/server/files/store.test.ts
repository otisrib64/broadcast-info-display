import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// store.ts resolves data/ from process.cwd() at import time, so switch to a
// throwaway dir before importing it.
const ORIGINAL_CWD = process.cwd();
const TMP = mkdtempSync(join(tmpdir(), "bid-store-"));
let store: typeof import("./store.js");

beforeAll(async () => {
  process.chdir(TMP);
  store = await import("./store.js");
});

afterAll(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(TMP, { recursive: true, force: true });
});

function upload(name: string): string {
  const tmp = store.tmpPath();
  writeFileSync(tmp, "hello");
  const result = store.commitFile(tmp, name, 5, "text/plain");
  if (!result.ok) throw new Error(result.reason);
  return result.meta.id;
}

describe("commitFile — extension sanitizing (table-driven)", () => {
  const cases: Array<{ name: string; file: string; ext: string }> = [
    { name: "keeps a plain extension",        file: "video.mp4",   ext: ".mp4" },
    { name: "lowercases the extension",       file: "LOGO.PNG",    ext: ".png" },
    { name: "drops an extension with spaces", file: "a.b c",       ext: ""     },
    { name: "drops a unicode extension",      file: "nota.çõ",     ext: ""     },
    { name: "no extension stays empty",       file: "README",      ext: ""     },
  ];

  for (const { name, file, ext } of cases) {
    it(name, () => {
      const id = upload(file);
      expect(id.slice(32)).toBe(ext);
      // Every committed id must be resolvable, or the file can never be deleted
      expect(() => store.resolveFilePath(id)).not.toThrow();
      expect(store.deleteFile(id)).toBe(true);
    });
  }
});

describe("deleteFile", () => {
  it("refuses to delete the index itself", () => {
    const id = upload("keep.txt");
    expect(store.deleteFile("index.json")).toBe(false);
    expect(existsSync(join(TMP, "data", "files", "index.json"))).toBe(true);
    expect(store.listFiles().map((f) => f.id)).toContain(id);
    store.deleteFile(id);
  });

  it("refuses ids that are not in the index", () => {
    writeFileSync(join(TMP, "data", "files", "stray.txt"), "x");
    expect(store.deleteFile("stray.txt")).toBe(false);
    expect(readdirSync(join(TMP, "data", "files"))).toContain("stray.txt");
  });

  it("drops an index entry whose file is already gone", () => {
    const id = upload("gone.txt");
    rmSync(store.resolveFilePath(id));
    expect(store.deleteFile(id)).toBe(true);
    expect(store.listFiles().map((f) => f.id)).not.toContain(id);
  });

  it("rejects path traversal", () => {
    expect(() => store.deleteFile("../state.json")).toThrow();
  });
});
