import { createClient } from "npm:@supabase/supabase-js@2";
import { manageUsers } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const origin =
  Deno.env.get("FRONTEND_ORIGIN") || "https://strellas-employees.vercel.app";
Deno.serve((request) =>
  manageUsers(
    request,
    createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: {
        headers: { Authorization: request.headers.get("authorization") || "" },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    origin,
    service,
  ),
);
