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

// Allowed extensions (no executables, no archives)
const ALLOWED_EXT = new Set([
  ".pdf", ".txt", ".csv", ".json", ".xml",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".mp4", ".mov", ".mkv", ".avi",
  ".mp3", ".wav", ".aac",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
]);

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

function safeExt(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : "";
}

function guardId(id: string): string {
  // Only allow safe id chars — no path separators or dots
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("invalid file id");
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

export type SaveResultType = { ok: true; meta: FileMeta } | { ok: false; reason: string };

export function canAcceptFile(originalName: string, sizeBytes: number): SaveResultType {
  const files = loadIndex();
  if (files.length >= MAX_FILES) return { ok: false, reason: "too_many" };
  if (totalBytes(files) + sizeBytes > MAX_TOTAL_BYTES) return { ok: false, reason: "quota_exceeded" };
  if (sizeBytes > MAX_FILE_BYTES) return { ok: false, reason: "file_too_large" };
  if (!safeExt(originalName)) return { ok: false, reason: "type_not_allowed" };
  return { ok: true, meta: null as unknown as FileMeta };
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
  if (!ext) return { ok: false, reason: "type_not_allowed" };

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
  if (!existsSync(abs)) return false;
  unlinkSync(abs);
  const files = loadIndex().filter((f) => f.id !== id);
  saveIndex(files);
  return true;
}

export function getFileMeta(id: string): FileMeta | null {
  return loadIndex().find((f) => f.id === id) ?? null;
}

export function tmpPath(): string {
  return join(TMP_DIR, randomUUID());
}

export const LIMITS = { MAX_TOTAL_BYTES, MAX_FILE_BYTES, MAX_FILES };
