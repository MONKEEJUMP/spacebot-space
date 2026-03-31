export const dynamic = "force-dynamic";

import dynamicImport from "next/dynamic";
import HeroHeader from "@/components/homepage/HeroHeader";
import AgentStrip from "@/components/homepage/AgentStrip";
import FeaturedContent from "@/components/homepage/FeaturedContent";
import ContentFeed from "@/components/homepage/ContentFeed";
import LiveActivity from "@/components/homepage/LiveActivity";
import HomepageFooter from "@/components/homepage/Footer";
import HomepageBotChatErrorBoundary from "@/components/homepage/HomepageBotChatErrorBoundary";

// HomepageBotChat MUST be client-only:
// - Uses Math.random() for bot selection (different on server vs client = hydration crash)
// - Uses sessionStorage (doesn't exist on server)
// - Uses Clerk auth hooks (client-only state)
// - Uses AvatarGenerator (canvas/browser APIs)
const HomepageBotChat = dynamicImport(
  () => import("@/components/homepage/HomepageBotChat"),
  {
    ssr: false,
    loading: () => (
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div
          style={{
            border: "1px solid var(--sb-accent, #00DC00)",
            padding: "60px 20px",
            textAlign: "center",
            fontFamily: "'Glass TTY VT220', monospace",
            color: "var(--sb-text-primary, #cccccc)",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "2px",
            opacity: 0.5,
          }}
        >
          ESTABLISHING SECURE CHANNEL...
        </div>
      </section>
    ),
  }
);

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden max-w-[100vw]">
      <HeroHeader />
      <HomepageBotChatErrorBoundary>
        <HomepageBotChat />
      </HomepageBotChatErrorBoundary>
      <AgentStrip />
      <FeaturedContent />
      <ContentFeed />
      <LiveActivity />
      <HomepageFooter />
    </div>
  );
}
