export async function cryptToken(value: string, encrypt: boolean) {
  const raw = Uint8Array.from(
    atob(Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY")!),
    (c) => c.charCodeAt(0),
  );
  if (raw.length !== 32)
    throw new Error("Token encryption key must be 32 bytes");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  if (encrypt) {
    const iv = crypto.getRandomValues(new Uint8Array(12)),
      encrypted = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          new TextEncoder().encode(value),
        ),
      );
    return btoa(String.fromCharCode(...iv, ...encrypted));
  }
  const all = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: all.slice(0, 12) },
      key,
      all.slice(12),
    ),
  );
}
export async function google(
  url: string,
  token: string,
  init: RequestInit = {},
) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Google API unavailable (${r.status})`);
  return r.status === 204 ? {} : r.json();
}
export async function accessToken(encrypted: string) {
  const refresh = await cryptToken(encrypted, false);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await r.json();
  if (!r.ok || !body.access_token)
    throw new Error("Google authorization expired or revoked");
  return body.access_token as string;
}
