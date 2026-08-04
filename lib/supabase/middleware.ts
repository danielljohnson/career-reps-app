import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseEnv } from "./env";

// Routes that require a session; unauthenticated visitors are sent to /login.
const PROTECTED_PATHS = ["/survey", "/dashboard"];

// Routes an already-signed-in user shouldn't see; they're sent to /dashboard.
const SIGNED_IN_REDIRECT_PATHS = ["/login", "/"];

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  if (!hasSupabaseEnv()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser revalidates the token with Supabase and refreshes it when expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
    return redirectPreservingCookies(request, response, "/login");
  }

  if (user && SIGNED_IN_REDIRECT_PATHS.includes(pathname)) {
    return redirectPreservingCookies(request, response, "/dashboard");
  }

  return response;
}

// Redirects while keeping any refreshed session cookies the session client
// just wrote onto `response`, so a token refresh isn't dropped mid-redirect.
function redirectPreservingCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
): NextResponse {
  const redirectResponse = NextResponse.redirect(
    new URL(pathname, request.url),
  );
  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

