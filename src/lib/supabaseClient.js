import { createClient } from "@supabase/supabase-js";

let client = null;

/**
 * Lazy on purpose: this project's Supabase instance doesn't exist yet.
 * Importing this file must not crash the app before .env is filled in —
 * the manual-search UI works fine with zero Supabase config. The error
 * only fires the first time something actually tries to talk to the DB
 * (e.g. writing to live_suggestions in a later phase).
 */
export function getSupabase() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Copy .env.example to .env and fill in " +
        "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from your project's " +
        "Settings → API page."
    );
  }

  client = createClient(url, anonKey);
  return client;
}

