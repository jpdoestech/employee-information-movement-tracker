import { createClient } from "npm:@supabase/supabase-js@2";
import { cryptToken } from "../_shared/google.ts";
const url = Deno.env.get("SUPABASE_URL")!,
  service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  clientId = Deno.env.get("GOOGLE_CLIENT_ID")!,
  redirect = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const admin = createClient(url, service, { auth: { persistSession: false } });
const origin = Deno.env.get("FRONTEND_ORIGIN")!;
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization,content-type,apikey,x-client-info",
  "Content-Type": "application/json",
};
async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers });
  try {
    const callback = new URL(req.url);
    if (req.method === "GET") {
      const state = callback.searchParams.get("state"),
        code = callback.searchParams.get("code");
      if (!state || !code) throw new Error("Missing authorization response");
      const { error } = await admin.rpc("worker_command", {
        operation: "consume_state",
        p: { state_hash: await hash(state) },
      });
      if (error) throw error;
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
          redirect_uri: redirect,
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await r.json();
      if (!r.ok || !data.refresh_token)
        throw new Error("Offline authorization was not granted");
      const stored = await admin.rpc("worker_command", {
        operation: "store_connection",
        p: {
          encrypted_refresh_token: await cryptToken(data.refresh_token, true),
        },
      });
      if (stored.error) throw stored.error;
      return new Response(
        "Google connected. Close this window and refresh Sheets sync.",
        {
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (req.method !== "POST" || req.headers.get("origin") !== origin)
      throw new Error("Invalid request origin");
    const bearer = req.headers.get("authorization");
    if (!bearer) throw new Error("Authentication required");
    const user = createClient(url, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false },
    });
    const { data: identity, error: authError } = await user.auth.getUser();
    if (authError || !identity.user) throw new Error("Authentication required");
    const state = crypto.randomUUID() + crypto.randomUUID();
    const { error } = await user.rpc("google_oauth_state", {
      state_hash: await hash(state),
    });
    if (error) throw error;
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/drive.file",
      state,
    }).toString();
    return new Response(JSON.stringify({ url: auth.toString() }), {
      headers: { ...headers, "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(
      JSON.stringify({
        error:
          "Google authorization failed. Check account access, consent and callback configuration.",
      }),
      { status: 400, headers },
    );
  }
});
