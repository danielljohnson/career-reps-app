import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Career Reps</h1>
      <p className="text-lg text-muted-foreground">
        Train for your job search like an athlete: take the career-fitness
        survey, get a 10-workday coaching routine, and log your reps.
      </p>
      <Link
        href="/login"
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Sign in to get started
      </Link>
    </main>
  );
}

