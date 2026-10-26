# S$0 temporary protected POC — PRON-88

> The intended independent cloud replacement is now assessed in [Render Free + Neon Free](../poc/render-neon-free-assessment.md). It has not been deployed. This existing tunnel was preserved; its operating instructions below still apply, including the laptop dependency.

26 October 2026. The paid Vercel/Render/Neon plan is **deferred**. This short-lived
synthetic demonstration runs on the existing WSL host. No cloud compute/database,
domain, subscription, payment method or billing upgrade was created.

## Access and protections

Browser → protected HTTPS Quick Tunnel/email PIN → loopback route gateway →
production Next standalone/app login → tenant responder permissions → local
PostgreSQL durable inbox/outbox → persistent Node worker → Groq GPT-OSS 20B.

[Cloudflare documents protected Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
using repeated `--allowed-mail` flags, without an account or domain. URLs change
on restart. There is no uptime guarantee, at most 200 in-flight requests, no SSE
and interactive email authentication rather than CLI access. Pronto uses polling.
No public-tunnel fallback exists in this launcher.

The official Linux amd64 `cloudflared 2026.10.3` binary was downloaded and checked
against release SHA-256
`053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0`.
The launcher requires that digest. Its help exposes `--allowed-mail`.
[The provider implementation](https://github.com/cloudflare/cloudflared/blob/2026.10.3/cmd/cloudflared/tunnel/quick_tunnel.go)
requests OTP mode and initializes its recipient/assertion/session validators
before forwarding. Recipient checks use the signed email identity. Code inspection
does not establish successful runtime rejection of a genuine unlisted identity.

The origin gateway starts closed. After exact-address validation and protected
tunnel assignment, an anonymous HTTPS probe must redirect to the exact Cloudflare
auth broker. Web/worker then start with the assigned HTTPS `APP_BASE_URL` and must
pass readiness before origin forwarding opens. Failures close access. Incoming
proxy/middleware headers are stripped and replaced with configured host/HTTPS
values. Mutation origins include scheme, host and port. App cookies are Secure,
HttpOnly and SameSite=Lax; PostgreSQL login throttling stays enabled.

Remote routes are limited to customer simulator, inbox/conversation pages, their
existing action APIs, auth, health and static assets. Administrative APIs, provider
webhooks, channel configuration, knowledge uploads and debugging routes are not
forwarded. Only the exact synthetic console channel can deliver; SMTP, Meta,
live Chope and booking writes remain disabled. The existing CSAT transport footer
is disabled for this narrow demo, rather than advertising an inaccessible route.

## Private configuration and data

[Configuration template](../../deploy/remote-demo.config.example.json): paths must
be absolute. Configuration/environment/provider dotenv/allowlist/TLS files must
be owned regular files, mode 600. The runtime directory must be owned mode 700
and not a symlink. Keep all private configuration outside Git.

The email JSON must contain exactly `gabriel` and `keith`, each a distinct,
explicitly approved full address. Wildcards, extra keys and synthetic domains
are rejected. Current private allowlist: `/tmp/pronto-remote/allowed-emails.json`.
Changing it requires revocation and a new tunnel. A discovered address alone is
not authorization to add it.

The provider dotenv needs only `GROQ_API_KEY`, `PRONTO_DEMO_REAL_AI_APPROVED=1` and
`PRONTO_GROQ_FREE_TIER_CONFIRMED=1`. The existing private `.env` is referenced and
parsed in memory; the key is not copied into tunnel arguments/config/logs.
The environment JSON contributes only `DATABASE_URL`, `PRONTO_DATABASE_CA`,
`AUTH_SECRET`, `PRONTO_SECRETS_KEY`, `PRONTO_DEMO_DATABASE_ID` and
`PRONTO_DEMO_ALLOWED_USER_IDS`. Other inherited provider/SMTP/test settings are
excluded; all deployment safety flags are enforced by the launcher.

Use a separate, identified local TLS database, never relabel `pronto_test`.
Follow the protected identity/migration/bootstrap procedure in the
[existing deployment runbook](../setup/vercel-demo.md), adapted to local PostgreSQL.
Tests/reset/seed must never target this database. The preflight checks its exact
marker, sole synthetic PS.Cafe tenant, synthetic users/conversations/knowledge,
invited IDs, sole active console channel, absent integration credentials and
approved Groq text retrieval. Create fresh random account passwords; fixture
passwords are unsuitable for remote use.

Current installation: dedicated `pronto_remote_poc` on owned local TLS PostgreSQL
55435, migrations 001–047, a SCRAM role without superuser/create-role/create-DB
powers. Existing databases were preserved; only a new role/database and HBA rules
for that database were added. Separate administrator/Gabriel/Keith synthetic
accounts were bootstrapped. Private credential files are
`/tmp/pronto-remote/operator-local.json`, `client-gabriel.json`, `client-keith.json`.
Inspect and deliver Keith's file through an agreed private channel; never paste
passwords into ChatGPT, source control, logs or this report.

The original dev app/worker/database remain on 3000/55433 and Mailpit 8025.
They are not tunnel destinations. Production web binds 127.0.0.1:3003, gateway
127.0.0.1:3004, local TLS acceptance listener 127.0.0.1:3002, metrics
127.0.0.1:20250. No router or Windows firewall port was opened.

The local TLS certificate expires **27 October 2026, 23:30 Singapore time**.
The launcher rejects expired certificates. Renew key/certificate and the private
database CA settings before a later demo; never disable verification. Cloudflare's
public HTTPS certificate is separate. Keep Windows awake, WSL running and the
network connected. `/tmp` data is temporary: back up private state before reboot.

## Start, inspect and revoke

The standalone build is in `/var/tmp/pronto-groq-app`, isolated from the running
dev `.next`. A build requires `.next/static` copied into
`.next/standalone/.next/static` and `public` into `.next/standalone/public`.
Build IDs must match. Do not copy dotenv files into standalone output. Rebuild
and reaccept after source changes; keep the separate worker on the same source.

From the repository:

```sh
pnpm demo:remote verify --config /tmp/pronto-remote/config.json --remote
pnpm demo:remote status --config /tmp/pronto-remote/config.json
tmux attach -t pronto-remote
tail -f /tmp/pronto-remote/logs/controller.log
tail -f /tmp/pronto-remote/logs/web.log /tmp/pronto-remote/logs/worker.log
```

For first launch only, when no session exists:

```sh
tmux new-session -d -s pronto-remote -n app /tmp/pronto-remote/start-remote
```

Revoke access immediately while keeping the local production app running:

```sh
pnpm demo:remote revoke --config /tmp/pronto-remote/config.json
```

This destroys existing gateway streams and terminates only its owned connector.
Stop the owned demo web/worker/tunnel, preserving databases and the original stack:

```sh
pnpm demo:remote stop --config /tmp/pronto-remote/config.json
```

After the controller exits, restart its existing tmux pane for a new URL:

```sh
tmux respawn-pane -t pronto-remote:app /tmp/pronto-remote/start-remote
pnpm demo:remote status --config /tmp/pronto-remote/config.json
```

Never use `respawn-pane -k` on a healthy pane or broad `pkill`/`killall` commands.
A stale control socket is not automatically replaced: inspect its owner/processes
before cleanup. `serve` without `--remote` performs local production/TLS acceptance
without a tunnel. During remote mode redirects use the public origin; the original
local UI remains available on 3000.

Administrative CLI uses **private localhost**, with separate operator credentials:

```sh
pnpm admin login --base-url http://localhost:3003
pnpm admin inspect operations --base-url http://localhost:3003
pnpm admin logout --base-url http://localhost:3003
```

It still authenticates and enforces permissions/origin checks. See the
[operator runbook](../ops/operator-cli.md) for essential mutations. Cloudflare PIN
access does not grant operator rights. No operator frontend is restored.

`/tmp/pronto-remote/backup` creates a private custom-format local `pg_dump` without
putting DB credentials in arguments. Inspect with `pg_restore --list PRIVATE_DUMP`.
Recovery must use a new, separately identified local database, then preflight and
acceptance; never overwrite the running DB. This is not offsite disaster recovery.

## Keith's exact steps

1. Get the **current** URL from Gabriel and open `/demo/customer`.
2. Use Keith's approved email at Cloudflare; enter the emailed PIN privately.
3. At Pronto's separate sign-in use the privately supplied synthetic Keith
   responder credentials. These differ from the email-PIN identity.
4. Select Groq GPT-OSS 20B, create a conversation and ask: “What is your address
   and what are your standard opening and closing hours?” Check real Groq/model
   attribution and local PostgreSQL retrieval. Quota failures are explicit;
   neither paid models nor Mock replace Groq automatically.
5. Open business inbox, open the persisted conversation, take over, send a manual
   synthetic reply, return to the simulator and see it, then release explicitly.
6. Use only public restaurant information and synthetic content. This unofficial
   persona does not represent PS.Cafe or send actual Instagram DMs/book tables.

The mail connector withholds authentication codes, so a human may need to finish
the PIN privately. Do not bypass this restriction or share browser/CLI session
files. Keith and Gabriel have independent app identities/simulator histories;
the authorized tenant inbox sees their tenant's persisted conversations.

No new paid infrastructure was activated. Groq Free eligibility is the supplied
account attestation, not an independently inspected invoice. Host sleep, TLS
expiry, temporary URLs and provider quotas can interrupt this demonstration.

Known UI limitation: the business shell's global preview banner currently says
answers are simulated even for a conversation pinned to real Groq. Per-message
Groq/model labels and provider usage are authoritative. A small profile-aware
copy correction remains; this does not mean that the verified Groq call was mocked.
