import { logout } from "@/app/login/actions";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Your daily routine and task tracker land here. Coming in a later step.
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}

