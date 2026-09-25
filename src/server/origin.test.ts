import { describe, it, expect } from "@jest/globals";
import type { IncomingMessage } from "node:http";
import { isSameOrigin } from "./origin.js";

function req(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe("isSameOrigin (table-driven)", () => {
  const cases: Array<{ name: string; headers: Record<string, string>; ok: boolean }> = [
    { name: "own page on localhost",       headers: { host: "localhost:8080",     origin: "http://localhost:8080" },     ok: true  },
    { name: "own page on LAN ip",          headers: { host: "192.168.10.63:8080", origin: "http://192.168.10.63:8080" }, ok: true  },
    { name: "non-browser client (no Origin)", headers: { host: "localhost:8080" },                                        ok: true  },
    { name: "host header case-insensitive", headers: { host: "LOCALHOST:8080",    origin: "http://localhost:8080" },     ok: true  },
    { name: "foreign site",                headers: { host: "localhost:8080",     origin: "https://evil.example" },      ok: false },
    { name: "same host, other port",       headers: { host: "localhost:8080",     origin: "http://localhost:3000" },     ok: false },
    { name: "opaque origin (sandbox/file)", headers: { host: "localhost:8080",    origin: "null" },                      ok: false },
    { name: "missing Host header",         headers: { origin: "http://localhost:8080" },                                 ok: false },
  ];

  for (const { name, headers, ok } of cases) {
    it(name, () => {
      expect(isSameOrigin(req(headers))).toBe(ok);
    });
  }
});
