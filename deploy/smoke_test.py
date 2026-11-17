"""Public deployment checks. Credentials and cookies are never printed.

Run with: python3 deploy/smoke_test.py SERVICE_URL
Uses only the Python standard library. Offline unit tests are in
deploy/tests/test_smoke.py.
"""
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.request


def request(base, path, data=None, opener=None):
    headers = {}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(
        base + path,
        headers=headers,
        data=json.dumps(data).encode() if data is not None else None,
    )
    client = opener or urllib.request.build_opener()
    with client.open(req, timeout=30) as response:
        return response.read()


def check(base):
    checks = (
        ('/api/health', lambda body: json.loads(body).get('status') == 'ok'),
        ('/api/ready', lambda body: json.loads(body).get('db') == 'connected'),
        ('/', lambda body: b'<html' in body.lower()),
        (
            '/api/v1/products?limit=100',
            lambda body: (
                json.loads(body).get('success') is True
                and isinstance(json.loads(body).get('data'), list)
                and len(json.loads(body)['data']) > 0
            ),
        ),
    )

    for path, predicate in checks:
        for attempt in range(5):
            try:
                if not predicate(request(base, path)):
                    raise ValueError('Unexpected response')
                break
            except (urllib.error.URLError, TimeoutError, ValueError):
                if attempt == 4:
                    raise RuntimeError('Smoke check failed: ' + path) from None
                time.sleep(3)
        print('PASS ' + path)

    email, password = os.getenv('SMOKE_EMAIL'), os.getenv('SMOKE_PASSWORD')
    if bool(email) != bool(password):
        raise RuntimeError('Set both SMOKE_EMAIL and SMOKE_PASSWORD, or neither.')
    if not email:
        print('SKIP login: optional smoke credentials not configured')
        return

    cookies = http.cookiejar.CookieJar()
    session = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    authenticated = False
    try:
        login = json.loads(
            request(
                base,
                '/api/auth/login',
                {'email': email, 'password': password},
                opener=session,
            )
        )
        login_data = login.get('data')
        authenticated = (
            login.get('success') is True
            and isinstance(login_data, dict)
            and bool(login_data.get('id'))
        )
        if not authenticated:
            raise ValueError('Login response did not contain a user')
        request(base, '/api/orders', opener=session)
        print('PASS login and authenticated orders')
    except (urllib.error.URLError, TimeoutError, ValueError, TypeError):
        raise RuntimeError('Login smoke check failed') from None
    finally:
        if len(cookies):
            request(base, '/api/auth/logout', data={}, opener=session)
            print('PASS logout')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 deploy/smoke_test.py SERVICE_URL')
    check(sys.argv[1].rstrip('/'))
