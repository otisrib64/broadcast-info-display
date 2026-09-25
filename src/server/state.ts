import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, copyFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { StateSchema, MAX_ROWS, type State } from "../shared/types.js";

const STATE_PATH = join(process.cwd(), "data", "state.json");
const TMP_PATH = STATE_PATH + ".tmp";
const HISTORY_DIR = join(process.cwd(), "data", "history");

const EMPTY_STATE: State = { rows: [] };

let cache: State = EMPTY_STATE;

// Schema caps keep a legit state under ~5 MB; a bigger file is corrupt or
// tampered and must not be buffered into RAM on boot.
const MAX_STATE_FILE_BYTES = 10 * 1024 * 1024;
const HISTORY_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY_FILES = 288;
const MAX_HISTORY_BYTES = 100 * 1024 * 1024;
let lastHistoryBackupAt = 0;

export function loadState(): State {
  try {
    const size = statSync(STATE_PATH).size;
    if (size > MAX_STATE_FILE_BYTES) {
      console.warn({ operation: "loadState", msg: "state file too large, using empty", size });
      return EMPTY_STATE;
    }
    const raw = readFileSync(STATE_PATH, "utf8");
    const parsed = StateSchema.safeParse(capRows(JSON.parse(raw)));
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

/**
 * A state saved under an older, higher row cap would fail validation and boot
 * empty. Keep the first MAX_ROWS rows instead, after backing up the original
 * file so the dropped rows can be recovered by hand.
 */
function capRows(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length <= MAX_ROWS) return data;
  const backup = `${STATE_PATH}.bak-${Date.now()}`;
  copyFileSync(STATE_PATH, backup);
  console.warn({ operation: "loadState", msg: "rows over limit, truncated", kept: MAX_ROWS, dropped: rows.length - MAX_ROWS, backup });
  return { ...data, rows: rows.slice(0, MAX_ROWS) };
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
  // The data dir is gitignored and git drops empty dirs, so a reset-based update
  // can leave it missing — recreate it so writes never fail with ENOENT.
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  backupStateBeforeOverwrite();
  writeFileSync(TMP_PATH, JSON.stringify(cache, null, 2), "utf8");
  renameSync(TMP_PATH, STATE_PATH);
  dirty = false;
}

/**
 * Keep local restore points before state replacement. Regular checkpoints are
 * spaced five minutes apart; any decrease in row count gets an immediate
 * snapshot so a stale/empty control client cannot silently erase the table.
 */
function backupStateBeforeOverwrite(): void {
  if (!existsSync(STATE_PATH)) return;

  const now = Date.now();
  let previousRows = 0;
  try {
    const previous = JSON.parse(readFileSync(STATE_PATH, "utf8")) as { rows?: unknown };
    if (Array.isArray(previous.rows)) previousRows = previous.rows.length;
  } catch {
    // Preserve unreadable files too; the snapshot remains useful for recovery.
  }

  const losingRows = previousRows > cache.rows.length;
  if (!losingRows && now - lastHistoryBackupAt < HISTORY_INTERVAL_MS) return;

  mkdirSync(HISTORY_DIR, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const backupPath = join(HISTORY_DIR, `state-${stamp}.json`);
  copyFileSync(STATE_PATH, backupPath);
  lastHistoryBackupAt = now;
  console.info({
    operation: "state.backup",
    rows: previousRows,
    reason: losingRows ? "before_rows_removed" : "periodic_checkpoint",
    path: backupPath,
  });

  const backups = readdirSync(HISTORY_DIR)
    .filter((name) => /^state-.*\.json$/.test(name))
    .map((name) => {
      const path = join(HISTORY_DIR, name);
      return { path, name, size: statSync(path).size };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  let totalBytes = backups.reduce((sum, file) => sum + file.size, 0);
  while (backups.length > MAX_HISTORY_FILES || totalBytes > MAX_HISTORY_BYTES) {
    const oldest = backups.shift();
    if (!oldest) break;
    unlinkSync(oldest.path);
    totalBytes -= oldest.size;
  }
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
