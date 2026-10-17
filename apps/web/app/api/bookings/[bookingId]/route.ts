import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, apiUrl, readApiResponse, sessionCookieName } from "@/lib/api";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to view this request." }, { status: 401 });
  const { bookingId } = await context.params;

  try {
    const response = await fetch(apiUrl(`/api/v1/bookings/${encodeURIComponent(bookingId)}`), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await readApiResponse(response);
    if (!response.ok) {
      return NextResponse.json({ error: apiErrorMessage(payload) }, { status: response.status });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}
