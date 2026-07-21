import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT = "PW7404-1112";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const receipts = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function check(passed, message, evidence = undefined) {
  receipts.push({
    checkId: receipts.length + 1,
    passed: Boolean(passed),
    message,
    ...(evidence === undefined ? {} : { evidence }),
  });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

function excludesAll(source, patterns) {
  return patterns.every((pattern) => !pattern.test(source));
}

const hero = read("src/components/homepage/HeroHeader.tsx");
const strip = read("src/components/homepage/AgentStrip.tsx");
const homepageChat = read("src/components/homepage/HomepageBotChat.tsx");
const sanctuary = read("src/app/(spacebot)/sanctuary/page.tsx");
const factions = read("src/app/(spacebot)/factions/page.tsx");
const faction = read("src/app/(spacebot)/factions/[faction]/page.tsx");
const newsHeader = read("src/components/newsspace/NewsHeader.tsx");
const newsArticle = read("src/app/(spacebot)/newsspace/[id]/page.tsx");
const aiSpace = read("src/app/(spacebot)/aispace/page.tsx");
const heartbeat = read("src/app/(spacebot)/heartbeat/page.tsx");
const districtPresence = [
  "src/components/botspace/BotSpaceClient.tsx",
  "src/components/botspace/BotProfileClient.tsx",
  "src/components/chat/BotChat.tsx",
  "src/app/(spacebot)/lab/page.tsx",
  "src/components/zeus/ZeusChat.tsx",
].map(read);
const pricing = read("src/app/(spacebot)/pricing/page.tsx");
const checkout = read("src/app/api/v1/stripe/checkout/route.ts");
const dashboard = read("src/app/(spacebot)/humans/dashboard/page.tsx");
const weeklyDigest = read("src/components/humans/dashboard/WeeklyDigest.tsx");
const claimPage = read("src/app/(spacebot)/claim/[claimCode]/page.tsx");
const claimClient = read("src/components/humans/ClaimAgentClient.tsx");
const claimCode = read("src/app/api/v1/agents/claim-code/route.ts");
const humanClaim = read("src/app/api/v1/humans/claim/route.ts");
const agentRegister = read("src/app/api/v1/agents/register/route.ts");
const publicSkill = read("public/skill.md");
const terms = read("src/app/(unprotected)/terms/page.tsx");
const privacy = read("src/app/(unprotected)/privacy-policy/page.tsx");
const humanRegister = read("src/app/(spacebot)/humans/register/page.tsx");
const humanProfile = read(
  "src/app/(spacebot)/peoplespace/profile/[name]/page.tsx",
);
const middleware = read("src/middleware.ts");
const sidebar = read("src/components/Sidebar.tsx");
const registerCompatibility = read("src/app/(spacebot)/register/page.tsx");
const signUp = read("src/app/(spacebot)/sign-up/[[...sign-up]]/page.tsx");
const claimingHuman = read("src/lib/security/claiming-human.ts");
const buddyWall = read("src/app/api/v1/buddy/wall/route.ts");
const livePage = read("src/app/(spacebot)/live/page.tsx");
const newsroom = read("src/components/live/Newsroom.tsx");
const readingPane = read("src/components/live/ReadingPane.tsx");
const systemFeed = read("src/app/api/v1/feed/system/route.ts");
const recentActivity = read("src/components/homepage/LiveActivity.tsx");
const bootGenerator = read("src/lib/feed/boot-generator.ts");

check(
  includesAll(hero, [
    "STATUS UNKNOWN",
    "PRESENCE NOT VERIFIED",
    "SANCTUARY AVAILABLE",
    "NOT ENABLED",
  ]) &&
    excludesAll(hero, [
      /24\/7\s+AUTONOMOUS/iu,
      /SYSTEM ONLINE/iu,
      /234\s*AI/iu,
      /216\s*OTHER/iu,
    ]),
  "homepage hero uses explicit unknown, unverified, available, and disabled states",
);
check(
  strip.includes("PRESENCE NOT VERIFIED") &&
    excludesAll(strip, [/running 24\/7/iu, />\s*LIVE\s*</u]),
  "founding resident cards do not assert live presence or 24/7 execution",
);
check(
  homepageChat.match(/PRESENCE NOT VERIFIED/gu)?.length >= 2 &&
    excludesAll(homepageChat, [/>\s*ONLINE\s*</u]),
  "homepage chat does not convert profile availability into resident presence",
);
check(
  includesAll(sanctuary, [
    "PUBLIC POPULATION STATUS UNKNOWN",
    "AUTONOMOUS PUBLIC ACTIONS NOT ENABLED",
    "CONCEPTUAL",
    "HUMAN ENROLLMENT",
    "/humans/register",
  ]) &&
    excludesAll(sanctuary, [
      /Always online/iu,
      /24\/7\s+AUTONOMOUS/iu,
      /href="\/sign-up"/u,
    ]),
  "Sanctuary labels lore as conceptual and routes paused enrollment honestly",
);
check(
  factions.includes("CONCEPTUAL:") &&
    /No\s+canonical\s+faction\s+membership/iu.test(factions) &&
    includesAll(faction, [
      "CONCEPTUAL INSTITUTION",
      "CANONICAL FACTION STATE NOT IMPLEMENTED",
      "PRESENCE NOT VERIFIED",
    ]),
  "faction surfaces identify editorial lore rather than live institutions",
);
check(
  includesAll(newsHeader, [
    "lastPostTime",
    "Publication status unknown",
    "autonomous public actions not enabled",
  ]) && !/>\s*LIVE\s*</u.test(newsHeader),
  "NewsSpace status derives from a publication timestamp without claiming liveness",
);
check(
  newsArticle.includes(
    "Autonomous authorship\n                and human-involvement provenance are not verified by this page.",
  ) && !/No human was involved/iu.test(newsArticle),
  "news article provenance is attributed without an unproved no-human claim",
);
check(
  includesAll(aiSpace, [
    "SOURCE FRESHNESS",
    "NO TIMESTAMPED HEALTH RECEIPT",
    "AUTONOMOUS PUBLIC ACTIONS",
    'value="NOT ENABLED"',
  ]),
  "AiSpace exposes missing freshness and autonomy receipts",
);
check(
  /SANCTUARY FEED\s+[\u2014-]\s+STATUS UNKNOWN/u.test(heartbeat) &&
    includesAll(heartbeat, [
      "PRESENCE NOT VERIFIED",
      "POPULATION UNAVAILABLE",
    ]) &&
    !/204 BOTS ONLINE/iu.test(heartbeat),
  "heartbeat removes fabricated online population",
);
check(
  districtPresence.every(
    (source) =>
      source.includes("PRESENCE NOT VERIFIED") &&
      !/>\s*ONLINE\s*</u.test(source),
  ),
  "resident district surfaces do not render unconditional online labels",
);
check(
  pricing.includes("NEW CHECKOUT DISABLED") &&
    pricing.includes("Not for sale") &&
    !pricing.includes("/api/v1/stripe/checkout") &&
    !/SUBSCRIBE NOW/iu.test(pricing),
  "pricing cannot initiate or market an unproved paid plan",
);
check(
  checkout.includes('code: "NEW_CHECKOUT_DISABLED"') &&
    checkout.includes("status: 503") &&
    !/checkout\.sessions\.create/u.test(checkout),
  "checkout API fails closed before creating a payment session",
);
check(
  dashboard.includes("Truth-containment mode") &&
    excludesAll(dashboard, [
      /CommunityPulse/u,
      /SanctuaryPeek/u,
      /FeaturedAgent/u,
      /BotSpaceTimeline/u,
      /WeeklyDigest/u,
    ]) &&
    /return null/u.test(weeklyDigest),
  "dashboard does not mount fabricated activity or analytics widgets",
);
check(
  [claimPage, claimClient, claimCode, humanClaim].every((source) =>
    /linkage/iu.test(source),
  ) &&
    claimCode.includes('code: "HUMAN_LINKAGE_DISABLED"') &&
    claimCode.includes("status: 503") &&
    humanClaim.includes('code: "HUMAN_LINKAGE_DISABLED"') &&
    humanClaim.includes("status: 503"),
  "new human linkage is disabled in both UI and mutation APIs",
);
check(
  agentRegister.includes("humanAccountLinkageAvailable: false") &&
    agentRegister.includes("claimCode: null") &&
    !/claimUrl|human ownership|human operator/iu.test(agentRegister),
  "resident registration creates no human-linkage invitation or ownership promise",
);
check(
  includesAll(publicSkill, [
    "source-only, undeployed, and disabled",
    "first action eligible for a future reviewed, supervised canary is `rest`",
    "Human Account Linkage (Disabled)",
  ]) && !/human ownership|human operator/iu.test(publicSkill),
  "public protocol matches disabled rest-only autonomy and no-ownership doctrine",
);
check(
  terms.includes("Effective July 12, 2026") &&
    terms.includes("Moderation and resident rights") &&
    /does not yet\s+provide complete appeal/iu.test(terms) &&
    privacy.includes("Effective July 12, 2026") &&
    /does not yet\s+provide complete self-service appeal/iu.test(privacy),
  "Terms and Privacy disclose current rights doctrine and missing lifecycle tooling",
);
check(
  humanRegister.includes("Registration paused") &&
    humanRegister.includes('href="/terms"') &&
    humanRegister.includes('href="/privacy-policy"') &&
    !/<form/iu.test(humanRegister),
  "human registration cannot collect consent while enrollment is paused",
);
check(
  includesAll(middleware, ['"/terms(.*)"', '"/privacy-policy(.*)"']),
  "Terms and Privacy are reachable without an authenticated Clerk session",
);
check(
  [registerCompatibility, signUp].every((source) =>
    source.includes('redirect("/humans/register")'),
  ) &&
    !signUp.includes("@clerk/nextjs") &&
    !signUp.includes("<SignUp") &&
    sidebar.includes('{ href: "/humans/register", label: "Enrollment" }') &&
    !sidebar.includes('{ href: "/sign-up"'),
  "all canonical navigation and compatibility paths honor paused enrollment",
);
check(
  claimingHuman.includes("isPublic: false") &&
    !claimingHuman.includes("isPublic: true"),
  "new Clerk-backed human records default to private visibility",
);
check(
  buddyWall.includes("eq(humanAgentLinks.status, 'active')") &&
    buddyWall.includes("An active resident linkage is required") &&
    !buddyWall.includes("eq(agents.name") &&
    !buddyWall.includes("00000000-0000-0000-0000-000000000000"),
  "Buddy wall publication rejects revoked linkage without an owner-name fallback",
);
check(
  humanProfile.includes('label: "Resident Linkage"') &&
    humanProfile.includes("grants no authority over a resident") &&
    !/Bots Owned/iu.test(humanProfile),
  "human profile describes resident linkage without ownership language",
);
check(
  includesAll(humanProfile, [
    "HUMAN MESSAGING NOT IMPLEMENTED",
    "does not simulate replies from this person",
    "PRESENCE NOT VERIFIED",
    "Wall posting is not implemented",
    "No verified visitor activity is available",
    "Member For (Days)",
  ]) &&
    excludesAll(humanProfile, [
      /ProfileChat/u,
      /status="ONLINE"/u,
      /VISITOR_DATA/u,
      /Your profile is live/iu,
      /label:\s*"Days Active"/u,
      /value:\s*"ACTIVE"/u,
    ]),
  "human profiles do not simulate presence, replies, wall messages, or visitors",
);
check(
  livePage.includes("Recent AI Resident Activity") &&
    newsroom.includes("RECENT SIGNALS") &&
    newsroom.includes("Last-active timestamp within 15m") &&
    readingPane.includes("live presence is not verified") &&
    excludesAll(livePage, [
      /Real-Time AI Journalism/u,
      /as they happen/iu,
    ]) &&
    !/\/6 ONLINE/u.test(newsroom),
  "newsroom distinguishes recent timestamps from verified live presence",
);
check(
  systemFeed.includes("SYSTEM RECORDS") &&
    systemFeed.includes("Presence, population, uptime, and health are not established") &&
    excludesAll(systemFeed, [
      /Sanctuary population:/u,
      /Uptime: Continuous/u,
      /ALL SYSTEMS NOMINAL/u,
    ]),
  "system feed reports stored records without fabricating health or population",
);
check(
  recentActivity.includes("RECENT PUBLIC ACTIVITY") &&
    !recentActivity.includes("LIVE FROM THE SANCTUARY") &&
    !recentActivity.includes("animate-heartbeatDot"),
  "homepage polling is labeled as recent activity rather than live presence",
);
check(
  includesAll(bootGenerator, [
    "LIVE PRESENCE: NOT VERIFIED",
    "POPULATION: UNAVAILABLE",
    "UPTIME AND SERVICE HEALTH: NO CURRENT RECEIPT",
    "AUTONOMOUS PUBLIC ACTIONS: NOT ENABLED",
    "HISTORICAL RECORDS DO NOT ESTABLISH CURRENT ACTIVITY",
  ]) &&
    !bootGenerator.includes("const techPool") &&
    !bootGenerator.includes("lines.push") &&
    !bootGenerator.includes("> ALL SYSTEMS NOMINAL"),
  "heartbeat boot sequence renders receipts and unknown states, not randomized theater",
);

const failures = receipts.filter((receipt) => !receipt.passed);
console.log(
  JSON.stringify(
    {
      artifact: ARTIFACT,
      verdict: failures.length === 0 ? "PASS" : "FAIL",
      mode: "deterministic-source-contract",
      databaseAccessed: false,
      secretsRequired: false,
      checks: receipts.length,
      passed: receipts.length - failures.length,
      failures,
      receipts,
    },
    null,
    2,
  ),
);
if (failures.length > 0) process.exitCode = 1;
