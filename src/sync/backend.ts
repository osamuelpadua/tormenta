import { useSyncExternalStore } from "react";
import { db } from "../storage/database";
import {
  MemoryBackend,
  MemoryServer,
  type MemoryState,
} from "./memory-backend";
import { SupabaseBackend } from "./supabase-backend";
import { SyncEngine, type SyncStatus } from "./sync-engine";
import type { RemoteBackend, Session } from "./types";

const DEMO_STATE = "tormenta-demo-server";
const DEMO_SESSION = "tormenta-demo-session";
function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the demo keeps working in memory.
  }
}
// A server kept in this browser, shared by its tabs, for trying accounts and
// campaigns before Supabase is configured. Not for real data.
function demoBackend() {
  const server = new MemoryServer(
    read<MemoryState>(DEMO_STATE) ?? undefined,
    (state) => write(DEMO_STATE, state),
  );
  const backend = new MemoryBackend(server, {
    kind: "demo",
    session: read<Session>(DEMO_SESSION),
  });
  backend.onSessionChange((session) => write(DEMO_SESSION, session));
  window.addEventListener("storage", (event) => {
    if (event.key === DEMO_STATE && event.newValue)
      server.replace(JSON.parse(event.newValue) as MemoryState);
  });
  return backend;
}
function createBackend(): RemoteBackend | null {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = import.meta
    .env;
  // An explicit demo request wins over a configured Supabase project, so
  // tests and previews never touch real accounts.
  if (
    import.meta.env.VITE_BACKEND === "demo" ||
    import.meta.env.MODE === "demo"
  )
    return demoBackend();
  if (url && key) return new SupabaseBackend(url, key);
  return null;
}

export const backend = createBackend();
// Without a backend the app stays local-only, exactly as before accounts.
export const engine = backend ? new SyncEngine(db, backend) : null;

const signedOut: SyncStatus = {
  session: null,
  state: "signed-out",
  notices: [],
};
const noop = () => () => {};
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    engine?.subscribe ?? noop,
    engine?.getStatus ?? (() => signedOut),
  );
}
