import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiErrorMessage, apiUrl, readApiResponse, sessionCookieName } from "@/lib/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ providerId: string }> },
) {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in with an admin account to view identity documents." }, { status: 401 });

  const { providerId } = await context.params;
  try {
    const response = await fetch(apiUrl(`/api/v1/admin/providers/${encodeURIComponent(providerId)}/identity-document`), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await readApiResponse(response);
      return NextResponse.json({ error: apiErrorMessage(payload) }, { status: response.status });
    }
    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": response.headers.get("content-disposition") ?? "attachment",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}
