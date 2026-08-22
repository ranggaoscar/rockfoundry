export const dynamic = "force-dynamic";

import { PROVIDER_PRESETS } from "@/lib/provider-config";

export async function GET() {
  return Response.json({ presets: PROVIDER_PRESETS });
}
