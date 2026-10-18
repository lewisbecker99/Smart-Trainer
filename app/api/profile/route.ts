import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { PROFILE_KEY, type AthleteProfile } from "@/lib/context";

export async function GET() {
  return NextResponse.json(await getSetting<AthleteProfile>(PROFILE_KEY, {}));
}

export async function PUT(req: Request) {
  const body = (await req.json()) as AthleteProfile;
  const profile: AthleteProfile = {
    name: body.name?.slice(0, 100),
    goals: body.goals?.slice(0, 2000),
    sports: body.sports?.slice(0, 500),
    weeklyHours: body.weeklyHours ? Number(body.weeklyHours) : undefined,
    constraints: body.constraints?.slice(0, 2000),
    preferences: body.preferences?.slice(0, 2000),
  };
  await setSetting(PROFILE_KEY, profile);
  return NextResponse.json(profile);
}
