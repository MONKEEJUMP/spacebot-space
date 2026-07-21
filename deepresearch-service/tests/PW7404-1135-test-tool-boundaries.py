from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest


SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from tools.security_boundaries import (  # noqa: E402
    parse_host_allowlist,
    resolve_contained_file,
    validate_public_http_url,
)


def resolver_for(*addresses: str):
    def resolve(_host: str, port: int, **_kwargs):
        return [(2, 1, 6, "", (address, port)) for address in addresses]

    return resolve


class WebBoundaryTests(unittest.TestCase):
    def test_requires_operator_allowlist(self):
        with self.assertRaises(ValueError):
            validate_public_http_url("https://example.com", (), resolver_for("93.184.216.34"))

    def test_rejects_non_http_credentials_and_unlisted_hosts(self):
        allowed = parse_host_allowlist("example.com")
        for candidate in (
            "file:///etc/passwd",
            "https://user:secret@example.com/",
            "https://other.example/",
        ):
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                validate_public_http_url(candidate, allowed, resolver_for("93.184.216.34"))

    def test_rejects_non_global_addresses(self):
        allowed = parse_host_allowlist("example.com")
        for address in ("127.0.0.1", "::1", "10.1.2.3", "169.254.169.254"):
            with self.subTest(address=address), self.assertRaises(ValueError):
                validate_public_http_url(
                    "https://example.com/path",
                    allowed,
                    resolver_for(address),
                )

    def test_accepts_allowlisted_public_address_and_wildcard(self):
        allowed = parse_host_allowlist("example.com,*.trusted.example")
        self.assertEqual(
            validate_public_http_url(
                "https://example.com/path",
                allowed,
                resolver_for("93.184.216.34"),
            ),
            "https://example.com/path",
        )
        self.assertEqual(
            validate_public_http_url(
                "https://docs.trusted.example/",
                allowed,
                resolver_for("8.8.8.8"),
            ),
            "https://docs.trusted.example/",
        )


class FileBoundaryTests(unittest.TestCase):
    def test_requires_root_and_rejects_escape_or_unsupported_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "safe.txt").write_text("safe", encoding="utf-8")
            (root / "unsafe.zip").write_bytes(b"not-a-real-zip")
            with self.assertRaises(ValueError):
                resolve_contained_file("safe.txt", None)
            for candidate in (str(root / "safe.txt"), "../safe.txt", "unsafe.zip"):
                with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                    resolve_contained_file(candidate, str(root))

    def test_accepts_regular_file_inside_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            nested = root / "uploads"
            nested.mkdir()
            expected = nested / "safe.txt"
            expected.write_text("safe", encoding="utf-8")
            self.assertEqual(
                resolve_contained_file("uploads/safe.txt", str(root)),
                expected.resolve(),
            )

    def test_rejects_symbolic_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "target.txt"
            target.write_text("safe", encoding="utf-8")
            link = root / "link.txt"
            try:
                os.symlink(target, link)
            except OSError:
                self.skipTest("Symbolic links are unavailable in this environment")
            with self.assertRaises(ValueError):
                resolve_contained_file("link.txt", str(root))


if __name__ == "__main__":
    unittest.main()
