import { legacyPrivateSurfaceRetired } from "@/lib/experience/legacy-private-surface";

export const dynamic = "force-dynamic";

export async function GET() {
  return legacyPrivateSurfaceRetired();
}
