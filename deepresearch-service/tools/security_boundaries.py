from __future__ import annotations

import ipaddress
from pathlib import Path
import socket
from typing import Callable, Iterable
from urllib.parse import urlsplit


Resolver = Callable[..., list[tuple]]

ALLOWED_FILE_SUFFIXES = {
    ".csv",
    ".doc",
    ".docx",
    ".pdf",
    ".pptx",
    ".txt",
    ".xls",
    ".xlsx",
}


def parse_host_allowlist(raw: str | None) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                value.strip().lower().rstrip(".")
                for value in (raw or "").split(",")
                if value.strip()
            }
        )
    )


def _host_is_allowed(host: str, allowed_hosts: Iterable[str]) -> bool:
    for pattern in allowed_hosts:
        if pattern.startswith("*."):
            suffix = pattern[1:]
            if host.endswith(suffix) and host != suffix[1:]:
                return True
        elif host == pattern:
            return True
    return False


def validate_public_http_url(
    candidate: str,
    allowed_hosts: Iterable[str],
    resolver: Resolver = socket.getaddrinfo,
) -> str:
    allowed = tuple(allowed_hosts)
    if not allowed:
        raise ValueError("Web visits are disabled until an operator host allowlist is configured")

    parsed = urlsplit(candidate.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only absolute HTTP(S) URLs are allowed")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URLs containing credentials are not allowed")

    host = parsed.hostname.lower().rstrip(".")
    if not _host_is_allowed(host, allowed):
        raise ValueError("The URL host is not in the DeepResearch allowlist")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addresses = resolver(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("The URL host could not be resolved") from exc
    if not addresses:
        raise ValueError("The URL host did not resolve to an address")

    for address in addresses:
        raw_ip = str(address[4][0]).split("%", 1)[0]
        try:
            ip = ipaddress.ip_address(raw_ip)
        except ValueError as exc:
            raise ValueError("The URL host resolved to an invalid address") from exc
        if not ip.is_global:
            raise ValueError("Private, loopback, link-local, and reserved addresses are blocked")

    return candidate.strip()


def resolve_contained_file(candidate: str, file_root_path: str | None) -> Path:
    if not file_root_path:
        raise ValueError("File parsing is disabled until FILE_ROOT_PATH is configured")

    relative = Path(candidate)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Only relative file paths inside FILE_ROOT_PATH are allowed")

    root = Path(file_root_path).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("FILE_ROOT_PATH must be an existing directory")

    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symbolic links are not allowed in parsed file paths")

    resolved = (root / relative).resolve(strict=True)
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError("The resolved file is outside FILE_ROOT_PATH") from exc

    if not resolved.is_file():
        raise ValueError("The requested path is not a regular file")
    if resolved.suffix.lower() not in ALLOWED_FILE_SUFFIXES:
        raise ValueError("The requested file type is not allowed")
    return resolved
