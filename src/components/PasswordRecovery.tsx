import { useState } from "react";
import { supabase } from "../api";
import { trackTransaction } from "../transactions";
import { FloatingNotification } from "./FloatingNotification";
import { confirmTransaction } from "./TransactionConfirmation";

export function PasswordRecovery({
  recovery,
  initialEmail,
  onComplete,
  onBack,
}: {
  recovery: boolean;
  initialEmail: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function back() {
    if (
      recovery &&
      (password || repeat) &&
      !(await confirmTransaction(
        "Discard changes?",
        "Your new password has not been saved.",
        "Discard changes",
        "Continue editing",
      ))
    )
      return;
    setBusy(true);
    try {
      if (recovery && supabase) {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
      }
      onBack();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>{recovery ? "Set a new password" : "Reset password"}</h2>
      <p>
        {recovery
          ? "Enter and confirm your new password."
          : "Enter your account email to receive a reset link."}
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          if (recovery && password !== repeat) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            if (!supabase)
              throw new Error("The account connection is unavailable.");
            if (
              !(await confirmTransaction(
                recovery ? "Change password?" : "Send reset email?",
                recovery
                  ? "Save the new password for your account?"
                  : `Send a password reset link to ${email}?`,
              ))
            )
              return;
            await trackTransaction(
              recovery ? "Updating password" : "Sending reset email",
              async () => {
                const { error } = recovery
                  ? await supabase!.auth.updateUser({ password })
                  : await supabase!.auth.resetPasswordForEmail(email, {
                      redirectTo: location.origin + location.pathname,
                    });
                if (error) throw error;
              },
            );
            if (recovery) {
              setPassword("");
              setRepeat("");
              onComplete();
            } else setSent(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {recovery ? (
          <>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                disabled={busy}
              />
            </label>
          </>
        ) : (
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <button className="primary" disabled={busy || sent}>
          {busy
            ? "Please wait…"
            : recovery
              ? "Save password"
              : "Send reset email"}
        </button>
      </form>
      <button onClick={back} disabled={busy}>
        Back to sign in
      </button>
      {error && (
        <FloatingNotification onDismiss={() => setError("")}>
          {error}
        </FloatingNotification>
      )}
      {sent && (
        <FloatingNotification kind="notice">
          If this email has an account, a reset link has been sent. Open the
          newest email to continue.
        </FloatingNotification>
      )}
    </>
  );
}
