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

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to apply as a plumber." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid plumber application." }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.display_name !== "string") {
    return NextResponse.json({ error: "Provide your name to apply as a plumber." }, { status: 400 });
  }

  const displayName = body.display_name.trim();
  if (displayName.length < 2 || displayName.length > 120) {
    return NextResponse.json({ error: "Your name must be between 2 and 120 characters." }, { status: 400 });
  }

  try {
    const response = await fetch(apiUrl("/api/v1/providers/me/apply"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ display_name: displayName }),
      cache: "no-store",
    });
    const payload = await readApiResponse(response);
    if (!response.ok) {
      return NextResponse.json({ error: apiErrorMessage(payload) }, { status: response.status });
    }
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}
