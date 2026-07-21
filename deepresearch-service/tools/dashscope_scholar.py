from __future__ import annotations

from tools.common import call_dashscope, normalize_list


class Scholar:
    name = "google_scholar"
    description = (
        "Perform academic-focused DashScope web searches for papers, preprints, "
        "journals, and official research sources."
    )
    parameters = [
        {
            "name": "query",
            "type": "array",
            "array_type": "string",
            "description": "The list of academic search queries.",
            "required": True,
        }
    ]

    def call(self, params: dict, **kwargs) -> str:
        queries = normalize_list(params.get("query"), "query")
        if not queries:
            return "No scholar queries were provided."

        prompt = "\n".join(
            [
                "Use web search to gather academic and technical sources.",
                "Prefer peer-reviewed papers, arXiv, PubMed, DOI pages, journals, conference proceedings, and official lab publications.",
                "Return plain text only using this schema for each query:",
                "QUERY: <query>",
                "1. TITLE: <paper or source title>",
                "   URL: <canonical url>",
                "   SOURCE TYPE: <journal|preprint|conference|official lab|other>",
                "   SNIPPET: <1-2 sentence summary grounded in the source>",
                "2. TITLE: ...",
                "Rules:",
                "- Include 3 to 5 results per query when available.",
                "- Keep URLs exact and directly useful.",
                "- Do not invent citations or metadata.",
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
                        "You are an academic search compiler. "
                        "Use DashScope web search and return only the requested schema."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            enable_search=True,
            search_strategy="agent",
            temperature=0.0,
            max_tokens=2200,
        )
        return result or "No academic search results were returned."
