import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiErrorMessage, apiUrl, readApiResponse, sessionCookieName } from "@/lib/api";

export async function GET() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in with an admin account to review plumber applications." }, { status: 401 });

  try {
    const response = await fetch(apiUrl("/api/v1/admin/providers/pending"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await readApiResponse(response);
    if (!response.ok) return NextResponse.json({ error: apiErrorMessage(payload) }, { status: response.status });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}
