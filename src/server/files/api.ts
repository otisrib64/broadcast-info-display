import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, createWriteStream, unlinkSync, existsSync } from "node:fs";
import busboy from "busboy";
import {
  listFiles, commitFile, resolveFilePath, deleteFile, getFileMeta, tmpPath, LIMITS,
} from "./store.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(payload);
}

// GET /api/files → list metadata
export function handleList(res: ServerResponse): void {
  json(res, 200, listFiles());
}

// POST /api/files → multipart upload (busboy)
export async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  broadcastFilesChanged: () => void,
): Promise<void> {
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > LIMITS.MAX_FILE_BYTES + 8192) {
    // Rough pre-check: body larger than max file + overhead
    req.resume();
    json(res, 413, { error: "file_too_large", maxBytes: LIMITS.MAX_FILE_BYTES });
    return;
  }

  const tmp = tmpPath();
  let originalName = "upload";
  let contentType  = "application/octet-stream";
  let sizeBytes    = 0;
  let aborted      = false;

  try {
    const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: LIMITS.MAX_FILE_BYTES } });

    await new Promise<void>((resolve, reject) => {
      bb.on("file", (_field, stream, info) => {
        originalName = info.filename || "upload";
        contentType  = info.mimeType || "application/octet-stream";

        const out = createWriteStream(tmp);
        stream.on("data",  (chunk: Buffer) => { sizeBytes += chunk.length; });
        stream.on("limit", () => {
          aborted = true;
          stream.resume();
          out.destroy();
          reject(new Error("file_too_large"));
        });
        stream.pipe(out);
        out.on("finish", resolve);
        out.on("error",  reject);
      });
      bb.on("error", reject);
      req.pipe(bb);
    });
  } catch (err) {
    if (existsSync(tmp)) unlinkSync(tmp);
    const reason = err instanceof Error ? err.message : "upload_error";
    const status = reason === "file_too_large" ? 413 : 400;
    json(res, status, { error: reason, maxBytes: LIMITS.MAX_FILE_BYTES });
    return;
  }

  if (aborted) {
    if (existsSync(tmp)) unlinkSync(tmp);
    json(res, 413, { error: "file_too_large", maxBytes: LIMITS.MAX_FILE_BYTES });
    return;
  }

  const result = commitFile(tmp, originalName, sizeBytes, contentType);
  if (!result.ok) {
    if (existsSync(tmp)) unlinkSync(tmp);
    const status = result.reason === "file_too_large" || result.reason === "quota_exceeded" ? 413 : 400;
    json(res, status, { error: result.reason });
    return;
  }

  broadcastFilesChanged();
  json(res, 201, result.meta);
}

// GET /api/files/:id → download
export function handleDownload(res: ServerResponse, id: string): void {
  const meta = getFileMeta(id);
  if (!meta) { json(res, 404, { error: "not_found" }); return; }

  let filePath: string;
  try {
    filePath = resolveFilePath(id);
  } catch {
    json(res, 400, { error: "invalid_id" });
    return;
  }

  if (!existsSync(filePath)) { json(res, 404, { error: "not_found" }); return; }

  const encoded = encodeURIComponent(meta.originalName).replace(/'/g, "%27");
  res.writeHead(200, {
    // Force octet-stream so html/svg/js never render in-browser (XSS prevention)
    "Content-Type":        "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
    "Content-Length":      String(meta.sizeBytes),
    "Cache-Control":       "no-store",
  });
  createReadStream(filePath).pipe(res);
}

// DELETE /api/files/:id
export function handleDelete(
  res: ServerResponse,
  id: string,
  broadcastFilesChanged: () => void,
): void {
  let deleted: boolean;
  try {
    deleted = deleteFile(id);
  } catch {
    json(res, 400, { error: "invalid_id" });
    return;
  }

  if (!deleted) { json(res, 404, { error: "not_found" }); return; }
  broadcastFilesChanged();
  json(res, 200, { ok: true });
}
