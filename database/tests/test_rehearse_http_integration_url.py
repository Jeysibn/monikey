from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import ProxyHandler, Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rehearse_http_integration import (  # noqa: E402
    DirectHTTPHandler,
    RejectRedirects,
    SAFE_TEST_BASE_URL,
    configured_base_url,
    local_opener,
    main,
    validate_local_destination,
)


class IntegrationUrlSafetyTests(unittest.TestCase):
    def test_allows_only_the_expected_loopback_compose_destinations(self) -> None:
        with patch.dict(os.environ, {"MONIKEY_E2E_BASE_URL": SAFE_TEST_BASE_URL}):
            self.assertEqual(configured_base_url(), SAFE_TEST_BASE_URL)
        self.assertEqual(validate_local_destination(SAFE_TEST_BASE_URL), SAFE_TEST_BASE_URL)
        self.assertEqual(validate_local_destination("http://127.0.0.1:8080/"), "http://127.0.0.1:8080/")
        self.assertEqual(
            validate_local_destination("http://127.0.0.1:8080/api/transactions?month=2026-11"),
            "http://127.0.0.1:8080/api/transactions?month=2026-11",
        )

    def test_rejects_destination_overrides_before_network_access(self) -> None:
        unsafe_urls = (
            "https://127.0.0.1:8080/api",
            "http://localhost:8080/api",
            "http://127.0.0.1:8081/api",
            "http://example.com/api",
            "http://user@127.0.0.1:8080/api",
            "http://127.0.0.1:8080/api#fragment",
            "//example.com/api",
        )
        for url in unsafe_urls:
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_local_destination(url)

        for url in ("http://example.com/api", "http://127.0.0.1:8081/api", "http://localhost:8080/api"):
            with self.subTest(base_url=url), self.assertRaises(ValueError):
                with patch.dict(os.environ, {"MONIKEY_E2E_BASE_URL": url}):
                    configured_base_url()

    def test_environment_override_is_rejected_by_base_validator(self) -> None:
        with patch.dict(os.environ, {"MONIKEY_E2E_BASE_URL": "http://example.com/api"}):
            with self.assertRaises(ValueError):
                configured_base_url()

    def test_main_rejects_unsafe_override_before_any_request(self) -> None:
        with patch.dict(os.environ, {"MONIKEY_E2E_BASE_URL": "http://example.com/api"}):
            with patch("rehearse_http_integration.call") as api_call:
                with patch("rehearse_http_integration.open_local_destination") as open_url:
                    with self.assertRaises(ValueError):
                        main()
        api_call.assert_not_called()
        open_url.assert_not_called()

    def test_redirect_handler_refuses_to_follow_external_location(self) -> None:
        handler = RejectRedirects()
        request = Request(SAFE_TEST_BASE_URL)
        result = handler.redirect_request(
            request,
            None,
            302,
            "Found",
            {},
            "https://example.com/collect",
        )
        self.assertIsNone(result)

    def test_local_opener_ignores_environment_proxies(self) -> None:
        with patch.dict(os.environ, {"http_proxy": "http://proxy.invalid:3128", "no_proxy": ""}):
            opener = local_opener()
        direct_handlers = [handler for handler in opener.handlers if isinstance(handler, DirectHTTPHandler)]
        proxy_handlers = [handler for handler in opener.handlers if isinstance(handler, ProxyHandler)]
        self.assertEqual(len(direct_handlers), 1)
        self.assertEqual(len(proxy_handlers), 1)
        self.assertEqual(proxy_handlers[0].proxies["http"], "http://proxy.invalid:3128")
        self.assertLess(direct_handlers[0].handler_order, proxy_handlers[0].handler_order)
        self.assertTrue(any(isinstance(handler, RejectRedirects) for handler in opener.handlers))


if __name__ == "__main__":
    unittest.main()
