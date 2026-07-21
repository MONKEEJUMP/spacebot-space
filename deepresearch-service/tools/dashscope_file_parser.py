from __future__ import annotations

import json
import os

from tools.common import normalize_list, truncate_text
from tools.security_boundaries import resolve_contained_file

from file_tools.file_parser import SingleFileParser


class FileParser:
    name = "parse_file"
    description = (
        "Parse user-uploaded PDF, DOCX, PPTX, TXT, CSV, XLSX, or DOC files "
        "that are contained inside the configured upload root."
    )
    parameters = [
        {
            "name": "files",
            "type": "array",
            "array_type": "string",
            "description": "Relative path(s) inside the configured upload root.",
            "required": True,
        }
    ]

    def _resolve_path(self, candidate: str, file_root_path: str | None) -> str:
        return str(resolve_contained_file(candidate, file_root_path))

    def call(self, params: dict, file_root_path: str | None = None, **kwargs) -> str:
        files = normalize_list(params.get("files"), "files")
        if not files:
            return "No files were provided."

        parser = SingleFileParser()
        outputs: list[str] = []
        for file_name in files:
            resolved = self._resolve_path(file_name, file_root_path)
            label = os.path.basename(resolved) or resolved
            try:
                result = parser.call(json.dumps({"url": resolved}))
                outputs.append(
                    f"# File: {label}\n{truncate_text(str(result), limit=28000)}"
                )
            except Exception as exc:
                outputs.append(f"# File: {label}\nERROR: {exc}")

        return "\n\n".join(outputs)
