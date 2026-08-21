import os from "node:os";

/** First usable LAN IPv4 (skips loopback and link-local). */
export function getLanIPv4(): string | null {
  const interfaces = os.networkInterfaces();
  const preferredNames = new Set(["en0", "en1", "eth0", "wlan0", "Wi-Fi"]);
  const preferred: string[] = [];
  const privateLan: string[] = [];
  const rest: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      const family = String(addr.family);
      if (family !== "IPv4" && family !== "4") continue;
      if (addr.internal) continue;
      if (addr.address.startsWith("169.254.")) continue;

      if (preferredNames.has(name)) preferred.push(addr.address);
      else if (isPrivateIpv4(addr.address)) privateLan.push(addr.address);
      else rest.push(addr.address);
    }
  }

  return preferred[0] ?? privateLan[0] ?? rest[0] ?? null;
}

function isPrivateIpv4(address: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(address);
}

export function requestDevPort(hostHeader: string | null): string {
  if (!hostHeader) return "3000";
  const ipv6 = hostHeader.match(/^\[.*\]:(\d+)$/);
  if (ipv6) return ipv6[1];
  const parts = hostHeader.split(":");
  if (parts.length === 2 && parts[1]) return parts[1];
  return "3000";
}
