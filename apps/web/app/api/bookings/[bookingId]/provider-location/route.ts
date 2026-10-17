import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiErrorMessage, apiUrl, readApiResponse, sessionCookieName } from "@/lib/api";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to track your plumber." }, { status: 401 });
  const { bookingId } = await context.params;

  try {
    const response = await fetch(apiUrl(`/api/v1/bookings/${encodeURIComponent(bookingId)}/provider-location`), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await readApiResponse(response);
    if (!response.ok) {
      return NextResponse.json({ error: apiErrorMessage(payload) }, { status: response.status });
    }
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reach the API." },
      { status: 502 },
    );
  }
}
