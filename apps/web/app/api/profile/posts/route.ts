import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, apiUrl, isRecord, isSameOriginRequest, readApiResponse, sessionCookieName } from "@/lib/api";

export async function GET() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to view your posts." }, { status: 401 });

  try {
    const response = await fetch(apiUrl("/api/v1/profiles/me/posts"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await readApiResponse(response);
    if (!response.ok) return NextResponse.json({ error: apiErrorMessage(payload) }, { status: response.status });
    return NextResponse.json(payload);
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
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to publish a post." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid post." }, { status: 400 });
  }
  if (!isRecord(body)) return NextResponse.json({ error: "Provide a valid post." }, { status: 400 });

  try {
    const response = await fetch(apiUrl("/api/v1/profiles/me/posts"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await readApiResponse(response);
    if (!response.ok) return NextResponse.json({ error: apiErrorMessage(payload) }, { status: response.status });
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}
