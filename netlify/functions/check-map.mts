// Scheduled function — runs once a day (UTC).
// Logs into the Rust server via WebRcon, reads the live seed + world size,
// and if it has changed since the last run, looks the new map up on
// RustMaps and stores the result in Netlify Blobs for current-map.mts to serve.
//
// Required environment variables (set in Netlify site settings, never in code):
//   RCON_HOST          e.g. 198.244.225.11
//   RCON_PORT          e.g. 28017
//   RCON_PASSWORD
//   RUSTMAPS_API_KEY
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const RCON_HOST = process.env.RCON_HOST;
const RCON_PORT = process.env.RCON_PORT;
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const RUSTMAPS_KEY = process.env.RUSTMAPS_API_KEY;

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

// Rust's console echoes convars back as: server.seed: "50000"
function parseConvar(message: string): string | null {
  const m = message.match(/:\s*"([^"]*)"/);
  return m ? m[1] : null;
}

export default async (_req: Request) => {
  if (!RCON_HOST || !RCON_PORT || !RCON_PASSWORD || !RUSTMAPS_KEY) {
    console.error("check-map: missing one of RCON_HOST / RCON_PORT / RCON_PASSWORD / RUSTMAPS_API_KEY env vars");
    return new Response("Missing configuration", { status: 500 });
  }

  const store = getStore("beer-uk-map");

  let seed: string | null, worldsize: string | null;
  try {
    seed = parseConvar(await rconCommand("server.seed"));
    worldsize = parseConvar(await rconCommand("server.worldsize"));
  } catch (e) {
    console.error("check-map: RCON check failed:", (e as Error).message);
    return new Response("RCON check failed", { status: 502 });
  }

  if (!seed || !worldsize) {
    console.error("check-map: could not parse seed/worldsize from RCON response");
    return new Response("Could not parse RCON response", { status: 502 });
  }

  type MapData = {
    seed: string;
    worldsize: string;
    status: "ready" | "generating";
    imageUrl?: string;
    mapUrl?: string;
    monuments?: number;
    land?: number;
    updated: string;
  };

  const current = (await store.get("current-map", { type: "json" })) as MapData | null;

  if (current && current.seed === seed && current.worldsize === worldsize && current.status === "ready") {
    console.log(`check-map: no change (seed ${seed}, size ${worldsize})`);
    return new Response("No change");
  }

  console.log(`check-map: seed/size is ${seed}/${worldsize} (previously ${current?.seed}/${current?.worldsize}) — looking up on RustMaps`);

  const lookupRes = await fetch(
    `https://api.rustmaps.com/v4/maps/${worldsize}/${seed}?staging=false`,
    { headers: { "X-API-Key": RUSTMAPS_KEY } },
  );

  if (lookupRes.status === 404) {
    console.log("check-map: map not generated yet on RustMaps — requesting generation, will pick it up on a future run");
    try {
      await fetch("https://api.rustmaps.com/v4/maps", {
        method: "POST",
        headers: { "X-API-Key": RUSTMAPS_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ size: Number(worldsize), seed: Number(seed), staging: false }),
      });
    } catch (e) {
      console.error("check-map: failed to request generation:", (e as Error).message);
    }
    await store.setJSON("current-map", {
      seed, worldsize, status: "generating", updated: new Date().toISOString(),
    } satisfies MapData);
    return new Response("Generation requested");
  }

  if (lookupRes.status === 409) {
    console.log("check-map: map still generating on RustMaps, will check again next run");
    await store.setJSON("current-map", {
      seed, worldsize, status: "generating", updated: new Date().toISOString(),
    } satisfies MapData);
    return new Response("Still generating");
  }

  if (!lookupRes.ok) {
    console.error("check-map: RustMaps lookup failed:", lookupRes.status, await lookupRes.text());
    return new Response("RustMaps lookup failed", { status: 502 });
  }

  const body = await lookupRes.json();
  const d = body.data ?? {};

  await store.setJSON("current-map", {
    seed,
    worldsize,
    status: "ready",
    imageUrl: d.imageUrl,
    mapUrl: d.url,
    monuments: d.totalMonuments,
    land: d.landPercentageOfMap,
    updated: new Date().toISOString(),
  } satisfies MapData);

  console.log(`check-map: updated — seed ${seed}, size ${worldsize}, monuments ${d.totalMonuments}`);
  return new Response("Map updated");
};

export const config: Config = {
  schedule: "@daily",
};
