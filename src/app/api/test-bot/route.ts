// Test Bot API - Direct qwen-flash connection via DashScope
// No orchestrator. No tool service. No wingmen. No LUCY. Just one model call.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY;
const MODEL = 'qwen-flash';

const SYSTEM_PROMPT = 'You are a helpful AI assistant on SpaceBot.Space. Answer questions directly and concisely. Do not overthink. Do not hedge. Give the answer. /no_think';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing message' },
        { status: 400 }
      );
    }

    const trimmedMessage = message.slice(0, 4000);

    const res = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: trimmedMessage },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        enable_thinking: false,
        enable_search: true,
        search_options: {
          search_strategy: "agent",
        },
        stream: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({
        success: false,
        response: 'Error connecting to QWEN. Please try again.',
        path: 'error',
        latency_ms: Date.now() - startedAt,
        debug: errText,
      });
    }

    // Parse SSE stream to collect full response
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let answer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) answer += delta;
        } catch {
          // skip malformed chunks
        }
      }
    }

    if (!answer) answer = 'No response from QWEN.';

    return NextResponse.json({
      success: true,
      response: answer,
      path: 'direct-qwen-flash',
      latency_ms: Date.now() - startedAt,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      response: 'Error connecting to QWEN. Please try again.',
      path: 'error',
      latency_ms: Date.now() - startedAt,
      debug: msg,
    });
  }
}
