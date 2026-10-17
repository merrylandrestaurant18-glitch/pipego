import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, apiUrl, isSameOriginRequest, readApiResponse, sessionCookieName } from "@/lib/api";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to request a plumber." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid booking request." }, { status: 400 });
  }

  try {
    const response = await fetch(apiUrl("/api/v1/bookings"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
