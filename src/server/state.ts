import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { StateSchema, type State } from "../shared/types.js";

const STATE_PATH = join(process.cwd(), "data", "state.json");
const TMP_PATH = STATE_PATH + ".tmp";

const EMPTY_STATE: State = { rows: [] };

let cache: State = EMPTY_STATE;

// Schema caps keep a legit state under ~5 MB; a bigger file is corrupt or
// tampered and must not be buffered into RAM on boot.
const MAX_STATE_FILE_BYTES = 10 * 1024 * 1024;

export function loadState(): State {
  try {
    const size = statSync(STATE_PATH).size;
    if (size > MAX_STATE_FILE_BYTES) {
      console.warn({ operation: "loadState", msg: "state file too large, using empty", size });
      return EMPTY_STATE;
    }
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

// Writing state.json on every keystroke (up to ~4 MB with an overlay image)
// blocks the event loop and wears the SD card. The cache updates immediately
// (broadcast reads it), but disk writes are coalesced: latest-wins, flushed at
// most every 500 ms, plus a sync flush on shutdown so nothing is lost.
const FLUSH_INTERVAL_MS = 500;
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;

export function saveState(state: State): void {
  cache = StateSchema.parse(state);
  dirty = true;
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      try {
        flushToDisk();
      } catch (err) {
        console.error({
          operation: "saveState.flush",
          error: err instanceof Error ? err.message : String(err),
          hint: "state save failed — is the data dir writable by the service user (pi)?",
        });
      }
    }, FLUSH_INTERVAL_MS);
  }
}

function flushToDisk(): void {
  if (!dirty) return;
  dirty = false;
  // The data dir is gitignored and git drops empty dirs, so a reset-based update
  // can leave it missing — recreate it so writes never fail with ENOENT.
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(TMP_PATH, JSON.stringify(cache, null, 2), "utf8");
  renameSync(TMP_PATH, STATE_PATH);
}

/** Flush any pending write immediately — called on SIGTERM/SIGINT/beforeExit. */
export function flushStateSync(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    flushToDisk();
  } catch (err) {
    console.error({ operation: "flushStateSync", error: err instanceof Error ? err.message : String(err) });
  }
}
