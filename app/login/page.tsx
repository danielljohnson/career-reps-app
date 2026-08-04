import { login, signup } from "./actions";

interface LoginPageProps {
  searchParams: { error?: string; message?: string };
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = searchParams;
  const checkEmail = searchParams.message === "check-email";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Career Reps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in or create an account to start your routine.
        </p>
      </div>

      {checkEmail && (
        <p
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm"
          role="status"
        >
          Check your email to confirm your account, then sign in below.
        </p>
      )}

      {error && (
        <p
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium">Sign in</h2>
        <form action={login} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium">Create an account</h2>
        <form action={signup} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Create account
          </button>
        </form>
      </section>
    </main>
  );
}
