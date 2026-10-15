import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

import { supabase } from "@/integrations/supabase/client";
import { useAuth, isRecoverySession } from "@/hooks/use-auth";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — EduBridge" },
      { name: "description", content: "Request a password reset link or set a new EduBridge password." },
      { property: "og:title", content: "Reset password — EduBridge" },
      { property: "og:description", content: "Recover access to your EduBridge account." },
    ],
  }),
  component: ResetPasswordPage,
});

function parseErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const searchParams = new URLSearchParams(window.location.search);
  const hashPart = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hashPart);
  const raw =
    searchParams.get("error_description") ||
    hashParams.get("error_description") ||
    searchParams.get("error") ||
    hashParams.get("error");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function hasRecoveryTokensInUrl(): boolean {
  if (typeof window === "undefined") return false;
  if (parseErrorFromUrl()) return false;
  const searchParams = new URLSearchParams(window.location.search);
  const hashPart = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hashPart);
  return (
    hashParams.get("type") === "recovery" ||
    hashParams.has("access_token") ||
    searchParams.get("type") === "recovery" ||
    Boolean(searchParams.get("code"))
  );
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, isPasswordRecovery } = useAuth();
  const [urlError, setUrlError] = useState<string | null>(() => parseErrorFromUrl());
  const [recovery, setRecovery] = useState(() => hasRecoveryTokensInUrl());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const errorShownRef = useRef(false);

  // Sync when useAuth detects recovery state or recovery session
  useEffect(() => {
    if (parseErrorFromUrl()) {
      setRecovery(false);
      return;
    }
    if (isPasswordRecovery) {
      setRecovery(true);
      return;
    }
    if (session && isRecoverySession(session.access_token)) {
      setRecovery(true);
    }
  }, [isPasswordRecovery, session]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const errorDesc = parseErrorFromUrl();
    if (errorDesc) {
      setUrlError(errorDesc);
      setRecovery(false);
      if (!errorShownRef.current) {
        errorShownRef.current = true;
        toast.error(errorDesc, { id: "reset-password-error" });
      }
      // Clean up the error query/hash from the URL so it doesn't linger
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (hasRecoveryTokensInUrl()) {
      setRecovery(true);
    }

    // Direct session check from Supabase
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && isRecoverySession(data.session.access_token) && !parseErrorFromUrl()) {
        setRecovery(true);
      }
    });

    // Supabase fires PASSWORD_RECOVERY when a recovery link is clicked and processed
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (
        (event === "PASSWORD_RECOVERY" ||
          (event === "SIGNED_IN" && isRecoverySession(nextSession?.access_token))) &&
        !parseErrorFromUrl()
      ) {
        setRecovery(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setUrlError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Check your inbox for the reset link.");
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);

    // If session is not yet set but code is in URL, ensure code exchange runs
    const {
      data: { session: activeSession },
    } = await supabase.auth.getSession();

    if (!activeSession) {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          setBusy(false);
          toast.error("Invalid or expired reset link. Please request a new one.", {
            id: "reset-password-error",
          });
          setRecovery(false);
          return;
        }
      }
    }

    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated successfully. Please log in.");
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  async function handleBackToLogin() {
    setBusy(true);
    try {
      // Ensure any recovery session is signed out so login doesn't bounce to dashboard
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          {recovery ? "Set a new password" : "Reset your password"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {recovery ? "Choose a new password for your account." : "We'll email you a secure reset link."}
        </p>

        {urlError && !recovery && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Reset link invalid or expired</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {urlError}. Please enter your email below to request a new link.
              </p>
            </div>
          </div>
        )}

        {recovery ? (
          <form className="mt-6 space-y-4" onSubmit={updatePassword}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <PasswordInput
                id="new-password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={requestLink}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send reset link
            </Button>
          </form>
        )}

        {recovery && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Need to request a new link?{" "}
            <button
              type="button"
              onClick={() => {
                setRecovery(false);
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
              className="text-primary hover:underline cursor-pointer"
            >
              Send another email
            </button>
          </p>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={handleBackToLogin}
            disabled={busy}
            className="font-medium text-primary hover:underline cursor-pointer"
          >
            Back to log in
          </button>
        </p>
      </div>
    </div>
  );
}
