import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { StateSchema, type State } from "../shared/types.js";

const STATE_PATH = join(process.cwd(), "data", "state.json");
const TMP_PATH = STATE_PATH + ".tmp";

const EMPTY_STATE: State = { rows: [] };

let cache: State = EMPTY_STATE;

export function loadState(): State {
  try {
    const raw = readFileSync(STATE_PATH, "utf8");
    const parsed = StateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn({ operation: "loadState", msg: "invalid state file, using empty", issues: parsed.error.issues });
      return EMPTY_STATE;
    }
    cache = parsed.data;
    return cache;
  } catch {
    return EMPTY_STATE;
  }
}

export function getState(): State {
  return cache;
}

export function saveState(state: State): void {
  const validated = StateSchema.parse(state);
  writeFileSync(TMP_PATH, JSON.stringify(validated, null, 2), "utf8");
  renameSync(TMP_PATH, STATE_PATH);
  cache = validated;
}
