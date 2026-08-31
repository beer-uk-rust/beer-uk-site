// Public, read-only endpoint the homepage fetches instead of embedding
// BattleMetrics' iframe widget directly. The widget was going blank for
// some visitors (third-party iframes + browser cookie restrictions), and
// separately BattleMetrics' API now requires a paid subscription — so
// player counts come from our own game server instead, via RCON.
//
// This endpoint itself does no RCON work — it just serves whatever
// check-status.mts last wrote to the blob store, so it's fast and cheap
// to hit on every page view (same pattern as current-map.mts).
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// If the last successful RCON check is older than this, treat it as stale
// (server or check-status.mts itself may be having trouble) rather than
// show a possibly-wrong player count.
const STALE_AFTER_MS = 20 * 60 * 1000; // 20 minutes

export default async (_req: Request) => {
  const store = getStore("beer-uk-status");
  const data = (await store.get("current-status", { type: "json" })) as
    | { status: string; players: number | null; maxPlayers: number | null; queued: number | null; updated: string }
    | null;

  const isFresh = !!data && Date.now() - new Date(data.updated).getTime() < STALE_AFTER_MS;

  return new Response(JSON.stringify(isFresh ? data : {}), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config: Config = {
  path: "/api/server-status",
  method: "GET",
};
