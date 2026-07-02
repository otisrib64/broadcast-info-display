import { describe, it, expect } from "@jest/globals";
import type { Row } from "../shared/types.js";

function makeRow(id: string): Row {
  return { id, frame: `F${id}`, model: "", source: "", description: "", note: "", status: "ok" };
}

describe("reorderRows (table-driven)", () => {
  const rows = [makeRow("a"), makeRow("b"), makeRow("c")];

  const cases: Array<{ name: string; ids: string[]; expected: string[] }> = [
    { name: "reorders normally",                 ids: ["c", "a", "b"],      expected: ["c", "a", "b"] },
    { name: "keeps order with identity ids",     ids: ["a", "b", "c"],      expected: ["a", "b", "c"] },
    { name: "ignores duplicated ids",            ids: ["b", "b", "a", "c"], expected: ["b", "a", "c"] },
    { name: "re-appends rows missing from ids",  ids: ["c"],                expected: ["c", "a", "b"] },
    { name: "ignores unknown ids",               ids: ["x", "b", "a", "c"], expected: ["b", "a", "c"] },
    { name: "empty ids keeps every row",         ids: [],                   expected: ["a", "b", "c"] },
    { name: "all duplicates keeps every row",    ids: ["a", "a", "a"],      expected: ["a", "b", "c"] },
  ];

  for (const { name, ids, expected } of cases) {
    it(name, async () => {
      const { reorderRows } = await import("./protocol.js");
      expect(reorderRows(rows, ids).map((r) => r.id)).toEqual(expected);
    });
  }

  it("never duplicates a row regardless of input", async () => {
    const { reorderRows } = await import("./protocol.js");
    const result = reorderRows(rows, ["a", "a", "b", "b", "c", "c", "a"]);
    expect(result).toHaveLength(rows.length);
    expect(new Set(result.map((r) => r.id)).size).toBe(rows.length);
  });
});
