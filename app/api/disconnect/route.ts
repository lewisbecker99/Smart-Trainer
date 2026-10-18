import { NextResponse } from "next/server";
import { deleteToken, type Provider } from "@/lib/tokens";

export async function POST(req: Request) {
  const { provider } = (await req.json()) as { provider?: Provider };
  if (provider !== "strava" && provider !== "whoop") {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }
  await deleteToken(provider);
  return NextResponse.json({ ok: true });
}
