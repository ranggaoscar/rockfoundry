"use client";
import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import "@/components/work-command-center.css";

function LoginPanel() {
  const params = useSearchParams();
  const callbackUrl =
    params.get("callbackUrl")?.startsWith("/") &&
    !params.get("callbackUrl")!.startsWith("//")
      ? params.get("callbackUrl")!
      : "/today";
  const error = params.get("error");
  const messages: Record<string, string> = {
    AccessDenied:
      "This Google account is not an authorized Rock Foundry owner.",
    Configuration: "Owner sign-in is not provisioned on this deployment yet.",
    OAuthAccountNotLinked:
      "Use the configured owner Google account to continue.",
    SessionRequired: "Sign in to open the private workspace.",
  };
  return (
    <main className="rf-app flex min-h-dvh items-center justify-center px-4">
      <section className="w-full max-w-[26rem] rounded-xl border border-border bg-surface p-7">
        <p className="text-[0.68rem] font-semibold tracking-[0.13em] text-muted-foreground">
          ROCK FOUNDRY
        </p>
        <h1 className="mt-2 text-[1.7rem] font-semibold tracking-tight">
          Owner sign-in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Private workspace access is limited to the configured owner Google
          account. There is no public registration.
        </p>
        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {messages[error] || "Sign-in was not completed. Try again."}
          </p>
        ) : null}
        <button
          className="work-button work-primary mt-6 w-full"
          type="button"
          onClick={() => void signIn("google", { callbackUrl })}
        >
          Continue with Google
        </button>
        <p className="mt-4 text-[0.75rem] text-muted-foreground">
          Sessions are stored in a secure HttpOnly cookie and expire
          automatically. Hermes execution credentials never reach the browser.
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="rf-loading">Loading…</div>}>
      <LoginPanel />
    </Suspense>
  );
}
