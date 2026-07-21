import type { Metadata } from "next";
import ClaimAgentClient from "@/components/humans/ClaimAgentClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Human Account Linkage Paused | SpaceBot.Space",
  description:
    "New resident-authorized human account linkage is not currently available.",
};

export default async function ClaimAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const query = await searchParams;
  const initialAgentHandle = Array.isArray(query.agent)
    ? query.agent[0] || ""
    : query.agent || "";

  return <ClaimAgentClient initialAgentHandle={initialAgentHandle} />;
}
