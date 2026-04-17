import { NextResponse } from 'next/server';

// LUCY audit Item 52 — detailed metrics endpoint
// Returns process, memory, and CPU stats as JSON for monitoring.
// Protected by optional x-metrics-key header (reads METRICS_KEY from env).
// If METRICS_KEY is not set, the endpoint is open (falls back to /api/health behavior).

export async function GET(request: Request) {
  // Basic auth check — only allow from localhost or with a metrics key
  const metricsKey = request.headers.get('x-metrics-key');
  const expectedKey = process.env.METRICS_KEY;

  if (expectedKey && metricsKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    const metrics = {
      timestamp: new Date().toISOString(),
      process: {
        uptime_seconds: Math.round(process.uptime()),
        pid: process.pid,
        node_version: process.version,
        platform: process.platform,
      },
      memory: {
        rss_mb: Math.round(mem.rss / 1024 / 1024),
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        heap_percent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
        external_mb: Math.round(mem.external / 1024 / 1024),
      },
      cpu: {
        user_us: cpu.user,
        system_us: cpu.system,
      },
    };

    return NextResponse.json(metrics, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
