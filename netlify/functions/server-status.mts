// Public, read-only endpoint the homepage fetches instead of embedding
// BattleMetrics' iframe widget directly. The widget was going blank for
// some visitors — third-party iframes are increasingly unreliable once a
// browser restricts cross-site cookies, since BattleMetrics' bot-check
// can't always complete inside the frame. Fetching their API from here
// (server-to-server, not a visitor's browser) sidesteps that entirely.
import type { Config } from "@netlify/functions";

const SERVER_ID = "40764435";

export default async (_req: Request) => {
  try {
    const res = await fetch(`https://api.battlemetrics.com/servers/${SERVER_ID}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error("server-status: BattleMetrics returned", res.status);
      return new Response(JSON.stringify({ error: "upstream_error" }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=15" },
      });
    }

    const body = await res.json();
    const attrs = body?.data?.attributes ?? {};

    const payload = {
      name: typeof attrs.name === "string" ? attrs.name : null,
      status: typeof attrs.status === "string" ? attrs.status : null,
      players: typeof attrs.players === "number" ? attrs.players : null,
      maxPlayers: typeof attrs.maxPlayers === "number" ? attrs.maxPlayers : null,
      rank: typeof attrs.rank === "number" ? attrs.rank : null,
      updated: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        // Short cache so the CDN absorbs repeat page loads instead of
        // hitting BattleMetrics on every single visitor.
        "Cache-Control": "public, max-age=30",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("server-status: fetch failed:", (e as Error).message);
    return new Response(JSON.stringify({ error: "fetch_failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=15" },
    });
  }
};

export const config: Config = {
  path: "/api/server-status",
  method: "GET",
};

