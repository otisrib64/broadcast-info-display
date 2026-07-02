export interface WeatherData {
  tempC: number;
  condition: string;
  raining: boolean;
  rainChancePct: number;
}

const TIMEOUT_MS = 8000;

// WMO weather code → human readable (Portuguese)
const WMO_LABELS: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente claro", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Névoa", 48: "Névoa com gelo",
  51: "Garoa fraca", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte",
  71: "Neve fraca", 73: "Neve", 75: "Neve forte",
  80: "Aguaceiros fracos", 81: "Aguaceiros", 82: "Aguaceiros fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade forte",
};

const RAINING_CODES = new Set([51,53,55,61,63,65,80,81,82,95,96,99]);

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,weathercode,precipitation");
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const cur = data["current"] as Record<string, unknown> | undefined;
    if (!cur) return null;

    const code = Number(cur["weathercode"] ?? 0);
    const tempC = Number(cur["temperature_2m"] ?? 0);
    const raining = RAINING_CODES.has(code);

    // Average of next 6h precipitation probability. The hourly arrays start at
    // 00:00 local time, so slice from the current hour — not from index 0,
    // which would report the (already past) early-morning window.
    const hourly = data["hourly"] as Record<string, unknown> | undefined;
    const probs = (hourly?.["precipitation_probability"] as number[] | undefined) ?? [];
    const times = (hourly?.["time"] as string[] | undefined) ?? [];
    const currentTime = String(cur["time"] ?? "");
    const nowIdx = times.findIndex((t) => t >= currentTime.slice(0, 13));
    const nextSix = probs.slice(Math.max(nowIdx, 0), Math.max(nowIdx, 0) + 6);
    const rainChancePct = nextSix.length > 0
      ? Math.round(nextSix.reduce((a, b) => a + b, 0) / nextSix.length)
      : 0;

    return {
      tempC: Math.round(tempC * 10) / 10,
      condition: WMO_LABELS[code] ?? "Desconhecido",
      raining,
      rainChancePct,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
