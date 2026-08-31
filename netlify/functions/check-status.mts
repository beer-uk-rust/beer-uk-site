// Scheduled function — runs every 5 minutes.
// Queries the Rust server itself over RCON for live player count, and
// stores the result in Netlify Blobs for server-status.mts to serve.
//
// We tried BattleMetrics' API for this first, but it now returns
// "Access denied. A subscription is required to use the API." even for
// server-to-server requests — so this asks the game server directly
// instead, using the same RCON credentials check-map.mts already uses.
//
// Required environment variables (set in Netlify site settings, never in code):
//   RCON_HOST          e.g. 198.244.225.11
//   RCON_PORT          e.g. 28017
//   RCON_PASSWORD
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const RCON_HOST = process.env.RCON_HOST;
const RCON_PORT = process.env.RCON_PORT;
const RCON_PASSWORD = process.env.RCON_PASSWORD;

function rconCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(`ws://${RCON_HOST}:${RCON_PORT}/${RCON_PASSWORD}`);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error(`RCON timed out waiting for "${cmd}"`));
    }, 8000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ Identifier: 1, Message: cmd, Name: "WebRcon" }));
    };
    ws.onmessage = (ev) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(String(ev.data));
        resolve(String(parsed.Message ?? ""));
      } catch (e) {
        reject(e as Error);
      } finally {
        try { ws.close(); } catch { /* ignore */ }
      }
    };
    ws.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("RCON connection error (check RCON_HOST/PORT/PASSWORD and that the port is open)"));
    };
  });
}

export default async (_req: Request) => {
  if (!RCON_HOST || !RCON_PORT || !RCON_PASSWORD) {
    console.error("check-status: missing one of RCON_HOST / RCON_PORT / RCON_PASSWORD env vars");
    return new Response("Missing configuration", { status: 500 });
  }

  const store = getStore("beer-uk-status");

  try {
    const raw = await rconCommand("serverinfo");
    const info = JSON.parse(raw);

    const payload = {
      status: "online" as const,
      players: typeof info.Players === "number" ? info.Players : null,
      maxPlayers: typeof info.MaxPlayers === "number" ? info.MaxPlayers : null,
      queued: typeof info.Queued === "number" ? info.Queued : null,
      updated: new Date().toISOString(),
    };

    await store.setJSON("current-status", payload);
    console.log(`check-status: ${payload.players}/${payload.maxPlayers} players (${payload.queued ?? 0} queued)`);
    return new Response("Status updated");
  } catch (e) {
    // Don't overwrite last-known-good data on a single failed poll (RCON can
    // be flaky) — just log it. server-status.mts checks the "updated"
    // timestamp and treats stale data as unavailable if this keeps failing.
    console.error("check-status: RCON check failed:", (e as Error).message);
    return new Response("RCON check failed", { status: 502 });
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};

