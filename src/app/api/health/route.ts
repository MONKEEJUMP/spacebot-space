import { NextResponse } from "next/server";
import { getRateLimiterHealth } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const rateLimiter = await getRateLimiterHealth();
    const healthCheck = {
      status: rateLimiter.status === "error" ? "error" : "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        rateLimiter,
      },
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      node: process.version,
    };

    return NextResponse.json(healthCheck, {
      status: rateLimiter.status === "error" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
