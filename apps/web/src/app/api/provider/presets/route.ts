import { withOwner } from "@/lib/owner-access";
export const dynamic = "force-dynamic";

import { PROVIDER_PRESETS } from "@/lib/provider-config";

async function GETHandler() {
  return Response.json({ presets: PROVIDER_PRESETS });
}
export const GET = withOwner(GETHandler);
