export interface GeoLocation {
  city: string;
  region: string;
  lat: number;
  lon: number;
}

const TIMEOUT_MS = 5000;
// GeoIP responses are ~1 KB; cap protects the Pi from a hijacked DNS/captive
// portal answering with an arbitrarily large body.
const MAX_RESPONSE_BYTES = 256 * 1024;

export async function detectLocation(): Promise<GeoLocation | null> {
  // env override for Pi provisioning (no outbound lookup needed on known sites)
  const lat  = process.env["BID_LAT"];
  const lon  = process.env["BID_LON"];
  const city = process.env["BID_CITY"];
  if (lat && lon && city) {
    return { city, region: city, lat: Number(lat), lon: Number(lon) };
  }

  // Try ipapi.co first, then ipinfo.io as fallback (both HTTPS, no key)
  const result = await tryIpApiCo() ?? await tryIpInfo();
  return result;
}

async function tryIpApiCo(): Promise<GeoLocation | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: ctrl.signal });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) return null;
    const data = await res.json() as Record<string, unknown>;
    if (data["error"]) return null;
    return {
      city:   String(data["city"] ?? ""),
      region: String(data["region"] ?? ""),
      lat:    Number(data["latitude"] ?? 0),
      lon:    Number(data["longitude"] ?? 0),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryIpInfo(): Promise<GeoLocation | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // ipinfo.io: HTTPS gratuito, 50k req/mês, campo loc="lat,lon"
    const res = await fetch("https://ipinfo.io/json", { signal: ctrl.signal });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) return null;
    const data = await res.json() as Record<string, unknown>;
    const loc = String(data["loc"] ?? "");
    const [latStr, lonStr] = loc.split(",");
    if (!latStr || !lonStr) return null;
    return {
      city:   String(data["city"] ?? ""),
      region: String(data["region"] ?? ""),
      lat:    Number(latStr),
      lon:    Number(lonStr),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
