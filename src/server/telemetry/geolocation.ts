export interface GeoLocation {
  city: string;
  region: string;
  lat: number;
  lon: number;
}

const TIMEOUT_MS = 5000;

export async function detectLocation(): Promise<GeoLocation | null> {
  // env override for Pi provisioning (no outbound lookup needed on known sites)
  const lat  = process.env["BID_LAT"];
  const lon  = process.env["BID_LON"];
  const city = process.env["BID_CITY"];
  if (lat && lon && city) {
    return { city, region: city, lat: Number(lat), lon: Number(lon) };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // ipapi.co: HTTPS gratuito, sem chave, 1000 req/dia
    const res = await fetch("https://ipapi.co/json/", { signal: ctrl.signal });
    if (!res.ok) return null;
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
