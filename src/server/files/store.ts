import {
  mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync, existsSync,
} from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { FileMetaSchema, type FileMeta } from "../../shared/types.js";
import { z } from "zod";

const FILES_DIR  = join(process.cwd(), "data", "files");
const INDEX_PATH = join(FILES_DIR, "index.json");
const TMP_DIR    = join(process.cwd(), "data", "files", ".tmp");

const MAX_TOTAL_BYTES = 250 * 1024 * 1024;  // 250 MB
const MAX_FILE_BYTES  =  75 * 1024 * 1024;  //  75 MB
const MAX_FILES       = 15;


mkdirSync(FILES_DIR, { recursive: true });
mkdirSync(TMP_DIR,   { recursive: true });

function loadIndex(): FileMeta[] {
  try {
    const raw = readFileSync(INDEX_PATH, "utf8");
    return z.array(FileMetaSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveIndex(files: FileMeta[]): void {
  const tmp = INDEX_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify(files, null, 2), "utf8");
  renameSync(tmp, INDEX_PATH);
}

function totalBytes(files: FileMeta[]): number {
  return files.reduce((sum, f) => sum + f.sizeBytes, 0);
}

// The extension becomes part of the file id, which guardId() validates on
// download/delete — anything it would reject (spaces, unicode) must be dropped
// here, or the file becomes impossible to fetch or delete.
function safeExt(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(ext) ? ext : "";
}

function guardId(id: string): string {
  // Allow alphanum, dash, underscore, single dot for extension; resolve() + prefix check is the real guard
  if (!/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9]+)?$/.test(id)) throw new Error("invalid file id");
  const base = resolve(FILES_DIR);
  const abs  = resolve(join(FILES_DIR, id));
  if (!abs.startsWith(base + sep) && abs !== base) {
    throw new Error("path traversal blocked");
  }
  return abs;
}

export function listFiles(): FileMeta[] {
  return loadIndex();
}

export type RejectReason = "too_many" | "quota_exceeded" | "file_too_large";
export type SaveResultType = { ok: true; meta: FileMeta } | { ok: false; reason: RejectReason };

/** Preflight check — nothing is written, so there is no meta to return. */
export type PreflightResult = { ok: true } | { ok: false; reason: RejectReason };

export function canAcceptFile(originalName: string, sizeBytes: number): PreflightResult {
  const files = loadIndex();
  if (files.length >= MAX_FILES) return { ok: false, reason: "too_many" };
  if (totalBytes(files) + sizeBytes > MAX_TOTAL_BYTES) return { ok: false, reason: "quota_exceeded" };
  if (sizeBytes > MAX_FILE_BYTES) return { ok: false, reason: "file_too_large" };
  return { ok: true };
}

export function commitFile(
  tmpPath: string,
  originalName: string,
  sizeBytes: number,
  contentType: string,
): SaveResultType {
  const files = loadIndex();
  if (files.length >= MAX_FILES)                   return { ok: false, reason: "too_many" };
  if (totalBytes(files) + sizeBytes > MAX_TOTAL_BYTES) return { ok: false, reason: "quota_exceeded" };
  if (sizeBytes > MAX_FILE_BYTES)                  return { ok: false, reason: "file_too_large" };

  const ext = safeExt(originalName);
  const id   = randomUUID().replace(/-/g, "");
  const dest = join(FILES_DIR, id + ext);
  renameSync(tmpPath, dest);

  const meta: FileMeta = { id: id + ext, originalName, sizeBytes, uploadedAtMs: Date.now(), contentType };
  saveIndex([...files, meta]);
  return { ok: true, meta };
}

export function resolveFilePath(id: string): string {
  return guardId(id);
}

export function deleteFile(id: string): boolean {
  const abs = guardId(id);
  // Only ids present in the index are deletable — otherwise DELETE
  // /api/files/index.json would wipe the index and orphan every file.
  const files = loadIndex();
  if (!files.some((f) => f.id === id)) return false;
  if (existsSync(abs)) unlinkSync(abs);
  saveIndex(files.filter((f) => f.id !== id));
  return true;
}

export function getFileMeta(id: string): FileMeta | null {
  return loadIndex().find((f) => f.id === id) ?? null;
}

export function tmpPath(): string {
  return join(TMP_DIR, randomUUID());
}

export const LIMITS = { MAX_TOTAL_BYTES, MAX_FILE_BYTES, MAX_FILES };
