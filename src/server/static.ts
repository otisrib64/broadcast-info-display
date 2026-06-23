import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
};

function mimeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf("."));
  return MIME[ext] ?? "application/octet-stream";
}

export function resolveStatic(
  webRoot: string,
  urlPath: string,
): { body: Buffer; mime: string } | null {
  // Guard: resolve to absolute path and confirm it stays inside webRoot
  const abs = resolve(join(webRoot, urlPath));
  if (!abs.startsWith(resolve(webRoot) + "/") && abs !== resolve(webRoot)) {
    return null;
  }
  try {
    return { body: readFileSync(abs), mime: mimeFor(abs) };
  } catch {
    return null;
  }
}
