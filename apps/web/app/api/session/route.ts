import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  apiErrorMessage,
  apiUrl,
  isRecord,
  isSameOriginRequest,
  readApiResponse,
  sessionCookieName,
} from "@/lib/api";

type TokenResponse = {
  access_token: string;
  expires_in: number;
};

async function readRequestBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ user: null });

  try {
    const response = await fetch(apiUrl("/api/v1/users/me"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await readApiResponse(response);
    if (response.status === 401) {
      const result = NextResponse.json({ user: null });
      result.cookies.delete(sessionCookieName);
      return result;
    }
    if (!response.ok) {
      return NextResponse.json({ error: apiErrorMessage(payload) }, { status: response.status });
    }
    return NextResponse.json({ user: payload });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const body = await readRequestBody(request);
  if (
    !body ||
    (body.mode !== "login" && body.mode !== "register") ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  ) {
    return NextResponse.json({ error: "Provide a valid sign-in request." }, { status: 400 });
  }
  if (body.mode === "register" && body.password.length < 12) {
    return NextResponse.json({ error: "Password must contain at least 12 characters." }, { status: 400 });
  }

  try {
    let user: unknown;
    if (body.mode === "register") {
      const registration = await fetch(apiUrl("/api/v1/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: body.email, password: body.password }),
        cache: "no-store",
      });
      const registrationPayload = await readApiResponse(registration);
      if (!registration.ok) {
        return NextResponse.json(
          { error: apiErrorMessage(registrationPayload) },
          { status: registration.status },
        );
      }
      user = registrationPayload;
    }

    const login = await fetch(apiUrl("/api/v1/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: "no-store",
    });
    const loginPayload: unknown = await readApiResponse(login);
    if (!login.ok) {
      return NextResponse.json({ error: apiErrorMessage(loginPayload) }, { status: login.status });
    }
    if (!isRecord(loginPayload) || typeof loginPayload.access_token !== "string" ||
      typeof loginPayload.expires_in !== "number") {
      return NextResponse.json({ error: "The API returned an invalid sign-in response." }, { status: 502 });
    }

    const token: TokenResponse = {
      access_token: loginPayload.access_token,
      expires_in: loginPayload.expires_in,
    };
    if (!user) {
      const currentUser = await fetch(apiUrl("/api/v1/users/me"), {
        headers: { Authorization: `Bearer ${token.access_token}` },
        cache: "no-store",
      });
      const currentUserPayload = await readApiResponse(currentUser);
      if (!currentUser.ok) {
        return NextResponse.json(
          { error: apiErrorMessage(currentUserPayload) },
          { status: currentUser.status },
        );
      }
      user = currentUserPayload;
    }

    const result = NextResponse.json({ user });
    result.cookies.set(sessionCookieName, token.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: token.expires_in,
    });
    return result;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const result = NextResponse.json({ success: true });
  result.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return result;
}
