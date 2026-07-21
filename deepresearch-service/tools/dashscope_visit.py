from __future__ import annotations

import httpx
import os
from urllib.parse import urljoin

from tools.common import (
    DEFAULT_USER_AGENT,
    call_dashscope,
    normalize_list,
    strip_html,
    truncate_text,
)
from tools.security_boundaries import parse_host_allowlist, validate_public_http_url


MAX_REDIRECTS = 3
MAX_RESPONSE_BYTES = 2_000_000


class Visit:
    name = "visit"
    description = "Visit webpage(s), extract visible text, and summarize the goal-relevant evidence."
    parameters = [
        {
            "name": "url",
            "type": "array",
            "array_type": "string",
            "description": "The URL(s) of the webpage(s) to visit.",
            "required": True,
        },
        {
            "name": "goal",
            "type": "string",
            "description": "The specific information goal for visiting the webpage(s).",
            "required": True,
        },
    ]

    def _fetch_page(self, url: str) -> tuple[str, str, str]:
        allowed_hosts = parse_host_allowlist(
            os.getenv("DEEPRESEARCH_WEB_HOST_ALLOWLIST"),
        )
        current_url = validate_public_http_url(url, allowed_hosts)
        with httpx.Client(
            follow_redirects=False,
            trust_env=False,
            timeout=httpx.Timeout(25.0, connect=10.0),
            headers={"User-Agent": DEFAULT_USER_AGENT},
        ) as client:
            for redirect_count in range(MAX_REDIRECTS + 1):
                with client.stream("GET", current_url) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location or redirect_count == MAX_REDIRECTS:
                            raise ValueError("The webpage exceeded the redirect limit")
                        current_url = validate_public_http_url(
                            urljoin(current_url, location),
                            allowed_hosts,
                        )
                        continue

                    response.raise_for_status()
                    content_type = response.headers.get("content-type", "unknown")
                    declared_length = response.headers.get("content-length")
                    if declared_length and int(declared_length) > MAX_RESPONSE_BYTES:
                        raise ValueError("The webpage exceeds the response-size limit")

                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_RESPONSE_BYTES:
                            raise ValueError("The webpage exceeds the response-size limit")

                    encoding = response.encoding or "utf-8"
                    page_text = strip_html(body.decode(encoding, errors="replace"))
                    return page_text, content_type, current_url

        raise ValueError("The webpage could not be fetched")

    def _summarize_page(self, *, url: str, final_url: str, content_type: str, goal: str, page_text: str) -> str:
        excerpt = truncate_text(page_text, limit=22000)
        prompt = "\n".join(
            [
                "Extract only the information that matters for the research goal.",
                "Return plain text in this schema:",
                "URL: <final url>",
                "SUMMARY: <2-4 sentence synthesis>",
                "EVIDENCE:",
                "- <important supporting detail>",
                "- <important supporting detail>",
                "LIMITATIONS: <missing context, uncertainty, or paywall note if relevant>",
                "",
                f"Research goal: {goal}",
                f"Original URL: {url}",
                f"Final URL: {final_url}",
                f"Content-Type: {content_type}",
                "",
                "Webpage text:",
                excerpt,
            ]
        )

        return call_dashscope(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a careful webpage extractor for a research agent. "
                        "Do not hallucinate details that are not present in the page text."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=1600,
            timeout=90.0,
        )

    def call(self, params: dict, **kwargs) -> str:
        urls = normalize_list(params.get("url"), "url")
        goal = str(params.get("goal") or kwargs.get("question") or "").strip()
        if not urls:
            return "No URLs were provided."
        if not goal:
            goal = "Extract the most relevant information from the page."

        outputs: list[str] = []
        for url in urls[:5]:
            try:
                page_text, content_type, final_url = self._fetch_page(url)
                if not page_text:
                    outputs.append(f"URL: {url}\nERROR: The page did not return readable text.")
                    continue

                summary = self._summarize_page(
                    url=url,
                    final_url=final_url,
                    content_type=content_type,
                    goal=goal,
                    page_text=page_text,
                )
                outputs.append(summary or f"URL: {final_url}\nERROR: No summary was generated.")
            except Exception as exc:
                outputs.append(f"URL: {url}\nERROR: {exc}")

        return "\n\n".join(outputs)
