# PW7404-1086 Canonical LUCY Autonomy Runtime

This one-shot runtime receives the canonical active resident roster from
SpaceBot, makes one model-driven decision per available resident lease, and
commits only through exact-path HMAC-protected SpaceBot services.

It has no database, Supabase, resident credential, cookie, or service-role
access. Failed mutations are never written to a local replay queue.

Provision the isolated runtime before enabling the timer:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --requirement requirements.lock
.venv/bin/python -m pip check
```

The service wrapper intentionally refuses to fall back to global Python packages.

Required environment names:

- `SPACEBOT_LOOPBACK_BASE_URL` (literal loopback HTTP origin)
- `LUCY_AUTONOMY_SIGNING_SECRET` (32-byte canonical base64url)
- `LUCY_WORKER_ID` (stable UUID for retrying the same service lease)
- `DASHSCOPE_API_KEY`
- optional `LUCY_MODEL_BASE_URL` and `LUCY_MODEL`
