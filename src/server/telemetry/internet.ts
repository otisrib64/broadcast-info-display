export interface InternetStatus {
  online: boolean;
  onlineSinceMs: number | null;
  lastDownAtMs: number | null;
}

const CHECK_URL   = "https://connectivitycheck.gstatic.com/generate_204";
const TIMEOUT_MS  = 4000;

let online       = false;
let onlineSinceMs: number | null = null;
let lastDownAtMs: number | null = null;

export function getInternetStatus(): InternetStatus {
  return { online, onlineSinceMs, lastDownAtMs };
}

export async function checkInternet(): Promise<InternetStatus> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let isUp = false;
  try {
    const res = await fetch(CHECK_URL, { signal: ctrl.signal, method: "HEAD" });
    isUp = res.status === 204 || res.ok;
  } catch {
    isUp = false;
  } finally {
    clearTimeout(timer);
  }

  const now = Date.now();
  if (isUp && !online) {
    online = true;
    onlineSinceMs = now;
  } else if (!isUp && online) {
    online = false;
    lastDownAtMs = now;
    onlineSinceMs = null;
  }

  return getInternetStatus();
}
