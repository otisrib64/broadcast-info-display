import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface NetworkConfig {
  iface: string;
  mode: "static" | "dhcp";
  ip: string;
  prefix: number;
  gateway: string;
  dns: string[];
  connection: string;
}

export interface NetworkApplyInput {
  connection: string;
  mode: "static" | "dhcp";
  ip: string;
  prefix: number;
  gateway: string;
  dns: string[];
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 8000 });
}

function nmcli(args: string[]): string {
  try {
    return run("nmcli", args);
  } catch {
    // Fallback: try via sudo (non-root service user)
    return run("sudo", ["nmcli", ...args]);
  }
}

export function readNetworkConfig(): NetworkConfig {
  let iface = "eth0";
  let ip    = "";
  let prefix = 24;

  try {
    const out = run("ip", ["-4", "addr", "show"]);
    // First non-loopback interface with an inet addr
    const m = out.match(/^\d+:\s+(\w+):[^\n]+\n\s+inet\s+(\d+\.\d+\.\d+\.\d+)\/(\d+)/m);
    if (m?.[1] && m[2] && m[3]) { iface = m[1]; ip = m[2]; prefix = Number(m[3]); }
  } catch { /* best effort */ }

  let gateway = "";
  try {
    const out = run("ip", ["route", "show", "default"]);
    const m = out.match(/default via (\d+\.\d+\.\d+\.\d+)/);
    if (m?.[1]) gateway = m[1];
  } catch { /* best effort */ }

  let dns: string[] = [];
  try {
    const resolv = readFileSync("/etc/resolv.conf", "utf8");
    dns = [...resolv.matchAll(/^nameserver\s+(\S+)/gm)].map((m) => m[1]).filter((s): s is string => Boolean(s));
  } catch { /* best effort */ }

  // Find the active nmcli connection for this interface
  let connection = "Wired connection 1";
  let mode: "static" | "dhcp" = "dhcp";
  try {
    const conns = nmcli(["-t", "-f", "NAME,DEVICE", "connection", "show", "--active"]);
    for (const line of conns.trim().split("\n")) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const name = line.slice(0, colon);
      const dev  = line.slice(colon + 1);
      if (dev === iface) { connection = name; break; }
    }
    const method = nmcli(["-g", "ipv4.method", "connection", "show", connection]).trim();
    mode = method === "manual" ? "static" : "dhcp";
  } catch { /* best effort */ }

  return { iface, mode, ip, prefix, gateway, dns, connection };
}

function isValidIp(s: string): boolean {
  const parts = s.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

export function validateNetworkInput(input: NetworkApplyInput): string | null {
  if (input.mode === "static") {
    if (!isValidIp(input.ip))                              return "IP inválido";
    if (input.prefix < 8 || input.prefix > 30)            return "Prefixo fora do intervalo (8–30)";
    if (!isValidIp(input.gateway))                        return "Gateway inválido";
    for (const d of input.dns) {
      if (d && !isValidIp(d))                             return `DNS inválido: ${d}`;
    }
  }
  return null;
}

export function applyNetworkConfig(input: NetworkApplyInput): void {
  const err = validateNetworkInput(input);
  if (err) throw new Error(err);

  if (input.mode === "dhcp") {
    nmcli(["connection", "modify", input.connection,
      "ipv4.method",    "auto",
      "ipv4.addresses", "",
      "ipv4.gateway",   "",
      "ipv4.dns",       "",
    ]);
  } else {
    nmcli(["connection", "modify", input.connection,
      "ipv4.method",    "manual",
      "ipv4.addresses", `${input.ip}/${input.prefix}`,
      "ipv4.gateway",   input.gateway,
      "ipv4.dns",       input.dns.filter(Boolean).join(" "),
    ]);
  }

  // Bring connection back up to apply immediately
  nmcli(["connection", "up", input.connection]);
}
