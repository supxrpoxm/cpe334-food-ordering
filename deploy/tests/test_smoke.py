"""Offline unit tests for deploy/smoke_test.py (the network is mocked).

Run (repo root):  python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'
CI runs it too (.github/workflows/ci-docker.yml).

Covers: public checks pass + login skipped without credentials; a DB that is not
ready fails even if HTTP answers; the session is logged out even if a check fails.
CHANGE ME: if you change the endpoints in smoke_test.py, update `response()` below.
"""
import http.cookiejar
import importlib.util
from pathlib import Path
import urllib.request
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'smoke_test.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeTests(unittest.TestCase):
    def response(self, base, path, data=None, opener=None):
        if path == '/api/auth/login' and opener is not None:
            cookie_processor = next(
                handler
                for handler in opener.handlers
                if isinstance(handler, urllib.request.HTTPCookieProcessor)
            )
            cookie_processor.cookiejar.set_cookie(
                http.cookiejar.Cookie(
                    version=0,
                    name='session',
                    value='test-session',
                    port=None,
                    port_specified=False,
                    domain='demo.test',
                    domain_specified=False,
                    domain_initial_dot=False,
                    path='/',
                    path_specified=True,
                    secure=False,
                    expires=None,
                    discard=True,
                    comment=None,
                    comment_url=None,
                    rest={},
                    rfc2109=False,
                )
            )
        return {
            '/api/health': b'{"status":"ok"}',
            '/api/ready': b'{"db":"connected"}',
            '/': b'<html></html>',
            '/api/v1/products?limit=100': b'{"success":true,"data":[{"id":"product"}]}',
            '/api/auth/login': b'{"success":true,"data":{"id":"user"}}',
            '/api/orders': b'{"success":true,"data":[]}',
            '/api/auth/logout': b'',
        }[path]

    @patch.dict('os.environ', {}, clear=True)
    def test_public_checks_pass_and_skip_optional_login(self):
        with patch.object(smoke, 'request', side_effect=self.response) as req:
            smoke.check('https://demo.test')
            self.assertEqual(req.call_count, 4)

    @patch.dict('os.environ', {}, clear=True)
    def test_db_not_ready_fails_even_when_http_responds(self):
        def disconnected(base, path, **kwargs):
            return b'{"db":"disconnected"}' if path == '/api/ready' else self.response(base, path)
        with patch.object(smoke, 'request', side_effect=disconnected), patch.object(smoke.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '/api/ready'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', {'SMOKE_EMAIL': 'smoke@example.test', 'SMOKE_PASSWORD': 'test-only'}, clear=True)
    def test_session_is_logged_out_even_if_authenticated_check_fails(self):
        def broken_orders(base, path, data=None, opener=None):
            if path == '/api/orders':
                raise ValueError('Broken response')
            return self.response(base, path, data, opener)
        with patch.object(smoke, 'request', side_effect=broken_orders) as req:
            with self.assertRaisesRegex(RuntimeError, 'Login smoke'):
                smoke.check('https://demo.test')
            self.assertEqual(req.call_args.args[1], '/api/auth/logout')


if __name__ == '__main__':
    unittest.main()
