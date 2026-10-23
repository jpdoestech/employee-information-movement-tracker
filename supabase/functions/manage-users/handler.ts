import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function manageUsers(
  request: Request,
  admin: SupabaseClient,
  caller: SupabaseClient,
  origin: string,
  fingerprintKey: string,
): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (request.headers.get("origin") !== origin)
    return reply(403, { error: "Request origin is not allowed." });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return reply(405, { error: "Use POST to manage accounts." });
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer "))
    return reply(401, { error: "Sign in before managing accounts." });
  try {
    const { data: identity, error: authError } = await admin.auth.getUser(
      bearer.slice(7),
    );
    if (authError || !identity.user)
      return reply(401, { error: "Your sign-in session is no longer valid." });
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("role,active")
      .eq("id", identity.user.id)
      .single();
    if (profileError || !profile?.active || profile.role !== "superadmin")
      return reply(403, {
        error: "Only an active superadmin can manage accounts.",
      });
    const text = await request.text();
    if (text.length > 8192)
      return reply(400, { error: "Account request is too large." });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return reply(400, { error: "Invalid account request." });
    }
    if (!body || typeof body !== "object")
      return reply(400, { error: "Invalid account request." });
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name =
      typeof body.display_name === "string" ? body.display_name.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const passwordChange = body.action === "set_password";
    if (body.action !== undefined && !passwordChange)
      return reply(400, { error: "Unsupported account action." });
    if (
      (!passwordChange &&
        (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 ||
          !name ||
          name.length > 120 ||
          !["viewer", "admin", "superadmin"].includes(body.role))) ||
      (passwordChange &&
        (typeof body.user_id !== "string" ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
            body.user_id,
          ))) ||
      !reason ||
      reason.length > 500 ||
      typeof body.password !== "string" ||
      body.password.length < 8 ||
      body.password.length > 256 ||
      typeof body.request_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.request_id,
      )
    )
      return reply(400, {
        error: passwordChange
          ? "Choose an existing account, enter a reason and a password of 8 to 256 characters."
          : "Enter a valid email, name, role, reason and an initial password of at least 8 characters.",
      });
    // Bind retries to this administrator and exact input without storing a password digest that clients can brute-force.
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(fingerprintKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        JSON.stringify([
          identity.user.id,
          email,
          name,
          body.role,
          reason,
          body.password,
          ...(passwordChange ? ["set_password", body.user_id] : []),
        ]),
      ),
    );
    const fingerprint = Array.from(new Uint8Array(signature), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    if (passwordChange) {
      const receipt = (complete: boolean) =>
        admin.rpc("password_change_receipt", {
          p_actor: identity.user.id,
          p_target: body.user_id,
          p_request: body.request_id,
          p_reason: reason,
          p_fingerprint: fingerprint,
          p_complete: complete,
        });
      const previous = await receipt(false);
      if (previous.error || typeof previous.data?.completed !== "boolean")
        return reply(409, {
          error:
            "This password request could not be verified. Refresh the account and try again.",
        });
      if (previous.data.completed) return reply(200, { id: body.user_id });
      const target = await admin.auth.admin.getUserById(body.user_id);
      if (target.error || !target.data.user)
        return reply(404, { error: "The sign-in account could not be found." });
      const marker = target.data.user.app_metadata?.eimt_password_change;
      if (
        marker?.request_id === body.request_id &&
        (marker.actor !== identity.user.id ||
          marker.fingerprint !== fingerprint)
      )
        return reply(409, {
          error: "This request ID belongs to another password change.",
        });
      // Reconcile an interrupted audit without submitting the password write again.
      if (marker?.request_id !== body.request_id) {
        const updated = await admin.auth.admin.updateUserById(body.user_id, {
          password: body.password,
          app_metadata: {
            eimt_password_change: {
              actor: identity.user.id,
              request_id: body.request_id,
              fingerprint,
            },
          },
        });
        if (updated.error)
          return reply(
            updated.error.status && updated.error.status >= 500 ? 503 : 400,
            {
              error:
                updated.error.code === "same_password"
                  ? "Choose a different password."
                  : "The password could not be set. Check the password requirements and try again.",
            },
          );
      }
      const recorded = await receipt(true);
      if (recorded.error || !recorded.data?.completed)
        return reply(503, {
          code: "password_audit_pending",
          error:
            "The password was updated, but recording the change did not finish. Keep this form unchanged and retry to finish.",
        });
      return reply(200, { id: body.user_id });
    }
    const matches = (
      user: { app_metadata?: Record<string, unknown> } | null,
    ) => {
      const marker = user?.app_metadata?.eimt_provisioning as
        { actor?: string; fingerprint?: string } | undefined;
      return (
        marker?.actor === identity.user.id && marker.fingerprint === fingerprint
      );
    };
    const existing = await admin.auth.admin.getUserById(body.request_id);
    if (existing.error && existing.error.status !== 404)
      return reply(503, {
        error: "Account service is unavailable. Try again later.",
      });
    let account = existing.data.user;
    if (account && !matches(account))
      return reply(409, {
        error: "This request ID belongs to another account request.",
      });
    if (!account) {
      const created = await admin.auth.admin.createUser({
        id: body.request_id,
        email,
        password: body.password,
        email_confirm: true,
        app_metadata: {
          eimt_provisioning: { actor: identity.user.id, fingerprint },
        },
      });
      account = created.data.user;
      if (created.error) {
        // A concurrent identical request may have created the same ID; read it, never repeat the write.
        const concurrent = await admin.auth.admin.getUserById(body.request_id);
        if (matches(concurrent.data.user)) account = concurrent.data.user;
        else
          return reply(
            created.error.status && created.error.status >= 500 ? 503 : 409,
            {
              error:
                created.error.status && created.error.status >= 500
                  ? "Account service is unavailable. Try again later."
                  : created.error.message,
            },
          );
      }
    }
    if (!account)
      return reply(503, { error: "The account could not be created." });
    const enrolled = await caller.rpc("tracker_mutate", {
      operation: "profile",
      p: {
        id: account.id,
        display_name: name,
        role: body.role,
        active: true,
        reason,
      },
      request_id: body.request_id,
    });
    if (enrolled.error)
      return reply(503, {
        error:
          "The sign-in account was created, but enrollment did not finish. Retry without changing this form to complete it.",
        code: "enrollment_pending",
      });
    return reply(200, { id: account.id });
  } catch {
    return reply(503, {
      error:
        "The account change could not be completed. Your entries are preserved; retry this form when the connection is available.",
    });
  }
}
