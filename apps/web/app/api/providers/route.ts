import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, apiUrl, readApiResponse } from "@/lib/api";

export async function GET(request: NextRequest) {
  const parameters = new URLSearchParams();
  for (const name of ["latitude", "longitude"]) {
    const value = request.nextUrl.searchParams.get(name);
    if (value !== null) parameters.set(name, value);
  }

  try {
    const suffix = parameters.size > 0 ? `?${parameters.toString()}` : "";
    const response = await fetch(apiUrl(`/api/v1/providers/discover${suffix}`), {
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
