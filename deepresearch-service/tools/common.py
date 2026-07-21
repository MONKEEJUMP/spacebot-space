from __future__ import annotations

import html
import os
import re
from typing import Any, Iterable, List

from openai import OpenAI

DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
DEFAULT_MODEL_NAME = "qwen3-max"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (compatible; SpaceBot.DeepResearch/1.0; +https://spacebot.space)"
)
URL_RE = re.compile(r"https?://[^\s<>\"]+")


def get_base_url() -> str:
    return os.getenv("DASHSCOPE_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL


def get_api_key() -> str:
    return os.getenv("DASHSCOPE_API_KEY", "").strip()


def get_model_name() -> str:
    return os.getenv("MODEL_NAME", DEFAULT_MODEL_NAME).strip() or DEFAULT_MODEL_NAME


def build_client(timeout: float = 90.0) -> OpenAI:
    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not configured")
    return OpenAI(
        api_key=api_key,
        base_url=get_base_url(),
        timeout=timeout,
    )


def call_dashscope(
    messages: List[dict[str, str]],
    *,
    enable_search: bool = False,
    search_strategy: str = "agent",
    temperature: float = 0.1,
    max_tokens: int = 1800,
    timeout: float = 90.0,
) -> str:
    client = build_client(timeout=timeout)
    extra_body: dict[str, Any] = {"enable_thinking": False}
    if enable_search:
        extra_body["enable_search"] = True
        extra_body["search_strategy"] = search_strategy

    response = client.chat.completions.create(
        model=get_model_name(),
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        extra_body=extra_body,
    )
    return (response.choices[0].message.content or "").strip()


def normalize_list(value: Any, field_name: str) -> List[str]:
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, Iterable):
        items = [
            str(item).strip()
            for item in value
            if item is not None and str(item).strip()
        ]
        return items
    raise ValueError(f"{field_name} must be a string or list of strings")


def truncate_text(text: str, limit: int = 20000) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def strip_html(raw_html: str) -> str:
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", raw_html)
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_urls(text: str) -> List[str]:
    return dedupe_urls(match.rstrip(").,]") for match in URL_RE.findall(text or ""))


def dedupe_urls(urls: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    ordered: List[str] = []
    for url in urls:
        candidate = str(url).strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        ordered.append(candidate)
    return ordered


def preview(text: str, limit: int = 400) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def chunk_text(text: str, chunk_size: int = 500) -> List[str]:
    content = text or ""
    if not content:
        return []
    return [content[i:i + chunk_size] for i in range(0, len(content), chunk_size)]


def sanitize_segment(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", (value or "").strip())


def build_workspace_id(bot_slug: str, user_id: str) -> str:
    bot = sanitize_segment((bot_slug or "unknown").lower())
    user = sanitize_segment(user_id or "anon")
    return f"bot:{bot}:user:{user}"
