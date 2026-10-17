import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, apiUrl, isSameOriginRequest, readApiResponse, sessionCookieName } from "@/lib/api";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ providerId: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in with an admin account to review plumber applications." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Choose approve or reject for this application." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("status" in body) ||
    (body.status !== "verified" && body.status !== "rejected")) {
    return NextResponse.json({ error: "Choose approve or reject for this application." }, { status: 400 });
  }

  const { providerId } = await context.params;
  try {
    const response = await fetch(apiUrl(`/api/v1/admin/providers/${encodeURIComponent(providerId)}/verification`), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
