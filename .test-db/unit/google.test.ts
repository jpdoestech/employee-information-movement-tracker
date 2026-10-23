import { afterEach, expect, it, vi } from "vitest";
import {
  accessToken,
  cryptToken,
  google,
} from "../../supabase/functions/_shared/google";

const settings: Record<string, string> = {
  GOOGLE_TOKEN_ENCRYPTION_KEY: btoa(
    String.fromCharCode(...new Uint8Array(32).fill(23)),
  ),
  GOOGLE_CLIENT_ID: "synthetic-client",
  GOOGLE_CLIENT_SECRET: "synthetic-secret",
};
afterEach(() => vi.unstubAllGlobals());
function backend() {
  vi.stubGlobal("Deno", { env: { get: (name: string) => settings[name] } });
}

it("refresh tokens are randomized authenticated ciphertext and detect tampering", async () => {
  backend();
  const a = await cryptToken("synthetic-refresh-token", true);
  const b = await cryptToken("synthetic-refresh-token", true);
  expect(a).not.toEqual(b);
  expect(a).not.toContain("synthetic-refresh-token");
  expect(await cryptToken(a, false)).toEqual("synthetic-refresh-token");
  const damaged = Uint8Array.from(atob(a), (c) => c.charCodeAt(0));
  damaged[damaged.length - 1] ^= 1;
  await expect(
    cryptToken(btoa(String.fromCharCode(...damaged)), false),
  ).rejects.toThrow();
});

it("revoked consent produces a redacted failure for worker retry", async () => {
  backend();
  const token = await cryptToken("synthetic-refresh-token", true);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "private diagnostics",
          }),
          { status: 400 },
        ),
      ),
  );
  await expect(accessToken(token)).rejects.toThrow(
    "Google authorization expired or revoked",
  );
});

it("quota failures do not expose token or response payload", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("private diagnostics", { status: 429 })),
  );
  await expect(
    google("https://sheets.googleapis.com/synthetic", "synthetic-access-token"),
  ).rejects.toThrow("Google API unavailable (429)");
});

it("network failures propagate without manufacturing a successful write", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Network unavailable")),
  );
  await expect(
    google("https://sheets.googleapis.com/synthetic", "synthetic-access-token"),
  ).rejects.toThrow("Network unavailable");
});
