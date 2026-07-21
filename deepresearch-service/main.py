from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from time import monotonic
from typing import Any, Callable

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "repo" / "inference"))

from react_agent import MultiTurnReactAgent  # noqa: E402
from tools.common import build_workspace_id, chunk_text, dedupe_urls, extract_urls  # noqa: E402

PORT = int(os.getenv("PORT", "8102"))
MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT", "2"))
MISSION_TIMEOUT = int(os.getenv("MISSION_TIMEOUT", "180"))
REME_URL = os.getenv("REME_URL", "http://127.0.0.1:8101").rstrip("/")
MODEL_NAME = os.getenv("MODEL_NAME", "qwen3-max").strip() or "qwen3-max"
FILE_ROOT_PATH = os.getenv("FILE_ROOT_PATH", "").strip()

MISSION_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT)


class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    bot_slug: str = Field(default="deepresearch")
    user_id: str = Field(default="anonymous")
    session_id: str | None = None


def build_llm_config() -> dict[str, Any]:
    return {
        "model": MODEL_NAME,
        "generate_cfg": {
            "temperature": 0.2,
            "top_p": 0.9,
            "presence_penalty": 0.6,
        },
    }


def extract_prediction(result: dict[str, Any]) -> str:
    prediction = str(result.get("prediction") or "").strip()
    if prediction:
        return prediction

    messages = result.get("messages") or []
    for message in reversed(messages):
        content = str(message.get("content") or "").strip()
        if not content:
            continue
        if "<answer>" in content and "</answer>" in content:
            return content.split("<answer>", 1)[1].split("</answer>", 1)[0].strip()
        return content
    return ""


def extract_sources(result: dict[str, Any], report: str) -> list[str]:
    messages = result.get("messages") or []
    collected: list[str] = []
    for message in messages:
        collected.extend(extract_urls(str(message.get("content") or "")))
    collected.extend(extract_urls(report))
    return dedupe_urls(collected)


def append_sources(report: str, sources: list[str]) -> str:
    content = (report or "").strip()
    if not sources:
        return content

    normalized = content.lower()
    if "sources:" in normalized or "\n## sources" in normalized:
        return content

    source_lines = "\n".join(f"- {url}" for url in sources)
    return f"{content}\n\nSources:\n{source_lines}".strip()


async def write_reme_memory(
    req: ResearchRequest,
    report: str,
    sources: list[str],
) -> bool:
    workspace_id = build_workspace_id(req.bot_slug, req.user_id)
    body = "\n".join(
        [
            f"Research query: {req.query}",
            "",
            "Research report:",
            report,
        ]
    ).strip()[:50000]
    metadata = {
        "engine": "deepresearch",
        "bot_slug": req.bot_slug,
        "user_id": req.user_id,
        "session_id": req.session_id,
        "sources": sources,
        "streamed": True,
        "research": True,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                f"{REME_URL}/memory/write",
                json={
                    "workspace_id": workspace_id,
                    "content": body,
                    "metadata": metadata,
                },
            )
            response.raise_for_status()
        return True
    except Exception:
        return False


def run_agent_sync(
    req: ResearchRequest,
    event_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    agent = MultiTurnReactAgent(
        llm=build_llm_config(),
        event_callback=event_callback,
    )
    payload = {
        "item": {
            "question": req.query,
            "answer": "",
        },
        "file_root_path": FILE_ROOT_PATH or None,
    }
    return agent._run(payload, MODEL_NAME)


async def execute_research(
    req: ResearchRequest,
    event_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    started_at = monotonic()
    async with MISSION_SEMAPHORE:
        result = await asyncio.wait_for(
            asyncio.to_thread(run_agent_sync, req, event_callback),
            timeout=MISSION_TIMEOUT,
        )

    report = extract_prediction(result)
    sources = extract_sources(result, report)
    report_with_sources = append_sources(report, sources)
    memory_written = await write_reme_memory(req, report_with_sources, sources)

    return {
        "status": "ok",
        "query": req.query,
        "bot_slug": req.bot_slug,
        "user_id": req.user_id,
        "session_id": req.session_id,
        "report": report_with_sources,
        "sources": sources,
        "termination": result.get("termination"),
        "latency_ms": int((monotonic() - started_at) * 1000),
        "memory_written": memory_written,
    }


def to_sse(payload: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


app = FastAPI(title="SpaceBot DeepResearch", version="1.0.0")


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            "model": MODEL_NAME,
            "max_concurrent": MAX_CONCURRENT,
            "mission_timeout": MISSION_TIMEOUT,
            "port": PORT,
        }
    )


@app.post("/research")
async def research(req: ResearchRequest) -> JSONResponse:
    try:
        result = await execute_research(req)
        return JSONResponse(result)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Research mission timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/research/stream")
async def research_stream(req: ResearchRequest) -> StreamingResponse:
    async def event_stream():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        def emit(payload: dict[str, Any]) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, payload)

        task = asyncio.create_task(execute_research(req, emit))
        yield to_sse(
            {
                "type": "phase",
                "phase": "queued",
                "message": "DeepResearch mission accepted.",
            }
        )

        try:
            while True:
                if task.done() and queue.empty():
                    break

                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=0.25)
                    yield to_sse(payload)
                except asyncio.TimeoutError:
                    continue

            result = await task
            for chunk in chunk_text(result["report"], 700):
                yield to_sse({"type": "token", "text": chunk})
            yield to_sse(
                {
                    "type": "done",
                    "full_response": result["report"],
                    "sources": result["sources"],
                    "termination": result["termination"],
                    "latency_ms": result["latency_ms"],
                    "memory_written": result["memory_written"],
                }
            )
        except asyncio.TimeoutError:
            yield to_sse(
                {
                    "type": "error",
                    "message": "Research mission timed out.",
                }
            )
        except Exception as exc:
            yield to_sse(
                {
                    "type": "error",
                    "message": str(exc),
                }
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
