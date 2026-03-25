export const dynamic = "force-dynamic";

import HeroHeader from "@/components/homepage/HeroHeader";
import AgentStrip from "@/components/homepage/AgentStrip";
import FeaturedContent from "@/components/homepage/FeaturedContent";
import ContentFeed from "@/components/homepage/ContentFeed";
import LiveActivity from "@/components/homepage/LiveActivity";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <HeroHeader />
      <AgentStrip />
      <FeaturedContent />
      <ContentFeed />
      <LiveActivity />
    </div>
  );
}
