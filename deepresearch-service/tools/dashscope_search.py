from __future__ import annotations

from tools.common import call_dashscope, normalize_list


class Search:
    name = "search"
    description = (
        "Perform DashScope-powered web searches and return structured plain-text "
        "results with titles, URLs, and snippets."
    )
    parameters = [
        {
            "name": "query",
            "type": "array",
            "array_type": "string",
            "description": "The list of search queries.",
            "required": True,
        }
    ]

    def call(self, params: dict, **kwargs) -> str:
        queries = normalize_list(params.get("query"), "query")
        if not queries:
            return "No search queries were provided."

        prompt = "\n".join(
            [
                "Use web search to gather primary, recent, and high-signal sources.",
                "Return plain text only using this schema for each query:",
                "QUERY: <query>",
                "1. TITLE: <title>",
                "   URL: <canonical url>",
                "   SNIPPET: <1-2 sentence summary grounded in the source>",
                "2. TITLE: ...",
                "Rules:",
                "- Include 3 to 5 results per query when available.",
                "- Prefer official docs, company blogs, papers, reputable publications, and direct sources.",
                "- Include exact URLs for every source.",
                "- Do not use markdown tables.",
                "",
                "Queries:",
                *[f"- {query}" for query in queries],
            ]
        )

        result = call_dashscope(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a focused search results compiler. "
                        "Use the web search capability and return only the requested schema."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            enable_search=True,
            search_strategy="agent",
            temperature=0.0,
            max_tokens=2200,
        )
        return result or "No web search results were returned."
