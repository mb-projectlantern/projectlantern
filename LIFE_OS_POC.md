# Life OS / ChatGPT integration POC

Audit and implementation date: 2026-09-24. This is a small integration experiment, not the broader Life OS.

## Outcome and evidence

**WORKAROUND SUCCESS.** A normal ChatGPT scheduled task completed unattended and created [issue 3](https://github.com/mb-projectlantern/lifeos-results/issues/3). Its signed webhook automatically produced D1 result `ff6756ff-3347-4ae2-bc3b-73ba63d971b4`, external ID `github:1385602767:3`, received at `2026-09-24T14:17:36.498Z`. The authenticated dashboard API returns that result. [Actual ChatGPT experiment and completed task](https://chatgpt.com/c/6ab52e2a-0d14-83e8-b4d5-bfec2d23c98e) shows the same issue URL. No manual result transfer, per-run approval, Codex automation, or OpenAI API inference participated in that execution.

The scheduled time was 14:15:04 UTC; recorded execution was 14:17:29.235 UTC, about 2m25s late. The task is now completed and will not recur. This proves the scheduled transport path with **synthetic** content, not AMZN analysis quality or five-day reliability. The five-day AMZN prompt below is provided but has not been scheduled. A direct ChatGPT-to-Life-OS integration was not implemented or established.

Normal interactive ChatGPT also created [issue 2](https://github.com/mb-projectlantern/lifeos-results/issues/2), which automatically reached D1 as result `699ca570-9a43-49e6-89ef-0f95575f5f1d` at `2026-09-24T14:11:41.447Z`.

Live protected POC: https://project-lantern-life-os-poc.mb-projectlantern.workers.dev/life-os/

The user explicitly chose this preview domain for the POC instead of migrating DNS. The original `www.projectlantern.net` site and DNS stay unchanged. `/life-os/` is live on the preview origin; it is not live on the original domain.

Deployment evidence: D1 `d4a11f01-94c3-452c-98f9-d4e25926c75c`; private repository webhook `684955308`; [synthetic issue 1](https://github.com/mb-projectlantern/lifeos-results/issues/1) stored as result `9ff8d38f-e2bc-40f3-bda3-d3c61e58824f` with external ID `github:1385602767:1`. Direct synthetic POST returned 201 with result `28047319-ac08-439c-8e3e-64b2e760b33d`. Anonymous deployed page access returned 401. Initial webhook TLS activation failure and sub-millisecond timestamp validation failure were diagnosed and corrected, then the original event was redelivered successfully.

On the deployment Windows account, run the following command and paste the password into the browser's HTTP login prompt; username is **`lantern`**. Execution-policy bypass applies only to this process and does not change normal Windows settings.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Dev\ProjectLantern\projectlantern\life-os\access.ps1" -CopyPassword
```

The script verifies the password against the deployed HTTPS dashboard before copying it. The dashboard-only credential is Windows DPAPI-encrypted at `C:\Users\mattb\.projectlantern\dashboard-credential.xml`, outside both repositories. Other Windows users resolve their own user-profile directory. This location avoids packaged-app AppData redirection. The script can also read the original `life-os-secrets.xml` for compatibility. It never copies ingestion or webhook tokens. Clear the clipboard after pasting; clipboard history/sync may retain passwords.

### Dashboard setup and recovery

The original deployment created `life-os-secrets.xml` through a one-time local setup command, but the checked-in access script assumed that file already existed. There was no reproducible bootstrap or useful missing-file handling. During this repair, the original file was present and decryptable under `MATT_HOMEPC\mattb`; its password already authenticated successfully. Follow-up diagnosis confirmed the missing-path cause: Windows MSIX redirected the packaged Codex process's AppData writes into `C:\Users\mattb\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\ProjectLantern\`. Ordinary PowerShell saw no file at the apparent AppData path. A Windows file-handle query confirmed this physical redirection. The credential now lives under the user profile at `.projectlantern\dashboard-credential.xml`; another file-handle query confirmed that its physical path is not redirected. Earlier successful authentication checks inside Codex did not establish visibility from an ordinary terminal. The repair recovered that same password into the dashboard-only file; it did not generate a password or change Cloudflare authentication. The original secrets file was left unchanged.

For a fresh Windows machine or a missing/unreadable credential file, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Dev\ProjectLantern\projectlantern\life-os\initialize-access.ps1"
```

Adjust the checkout path on another machine. Initialization checks the current credential, an interrupted reset's encrypted `.pending` file, previous AppData credentials, and the physical `OpenAI.Codex_*\LocalCache\Local\ProjectLantern` locations. Access also checks these recovery locations if the current file is absent. It recovers a candidate only after it authenticates to the live dashboard. If none works, it prompts for the existing password with hidden input (retrieve it from your password manager or original machine), verifies it, creates the directory, and saves an encrypted dashboard-only credential. DPAPI files are tied to the Windows account and machine that created them; copying the XML to a new machine is not a password transfer mechanism. Cloudflare can list secret names but cannot return their values. Normal initialization never changes Cloudflare.

If the password is genuinely lost after checking your original machine and password manager, install the pinned dependencies and sign into the existing Cloudflare account with Wrangler, then explicitly request a reset:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Dev\ProjectLantern\projectlantern\life-os\initialize-access.ps1" -ResetPassword
```

Recovery still runs first. Only if no saved credential authenticates does this create a cryptographically random password, save an encrypted pending copy, confirm the existing dashboard secret names in Cloudflare, and update **only `DASHBOARD_PASSWORD`** through Wrangler stdin. It keeps username `lantern`, verifies the deployed password, and saves the canonical credential. It does not deploy Worker code or update ingestion/webhook secrets. If interrupted, retain the `.pending` file and rerun initialization; it checks whether that password is already active before attempting another reset. A network failure alone is not a reason to request a password reset.

Credential regression checks: `node --test life-os/test/credentials.test.js` on Windows. Nine tests cover missing/corrupt files, legacy recovery, packaged-app recovery when ordinary AppData files are absent, fresh import, rejected passwords, reset ordering, interrupted resets, and pending recovery. They use real Windows PowerShell/DPAPI with mocked network, Cloudflare, and clipboard boundaries. Separately, the actual `access.ps1 -CopyPassword` command was run under Windows PowerShell 5.1: its clipboard value matched the original saved password and authenticated to the deployed dashboard (HTTP 200). The working ingestion pipeline was neither modified nor retested for this repair. Final browser step: open the protected URL and enter `lantern` with the copied password.

| Test | Current evidence | Classification |
| --- | --- | --- |
| Synthetic pipeline | Six automated tests pass; local browser displays the requested synthetic card; deployed POST and signed GitHub delivery verified in D1 | Pipeline verified; cloud browser login still needs user |
| A: interactive ChatGPT publishes | Initial connector failure resolved by granting the app access to the new private repository. Normal ChatGPT created issue 2; webhook stored it automatically | PASS via GitHub intermediary |
| B: scheduled task writes directly | No direct scheduled custom-tool write demonstrated | Pending / unsupported path not assumed |
| C: scheduled task via intermediary | Normal scheduled ChatGPT execution created issue 3; real webhook stored it and authenticated dashboard API returned it | PASS — WORKAROUND SUCCESS |

The result is **WORKAROUND SUCCESS**, not DIRECT SUCCESS. The real browser verified dashboard rendering locally; deployed read/API authentication and returned data were verified remotely. The in-app browser blocked automated opening of the cloud Basic-auth page, so final cloud-browser login remains a user-side check using `access.ps1`. The normal scheduled result is visible in ChatGPT; delivery of an OS push/email notification was not independently verified (desktop push permission was not enabled).

## 1. Existing architecture and infrastructure audit

The complete original tracked tree is `index.html`, `favicon.png`, and `CNAME`. No backend, build system, database, package manifest, workflow, or repository guidance file existed. All original text files were inspected; the PNG is the favicon. Git origin is `https://github.com/mb-projectlantern/projectlantern.git`, a **public** repository. Initial checkout was clean at `923f8e0` on `main`; only local `main` and cached `origin/main` existed.

Authenticated GitHub Pages API confirmed `status=built`, `build_type=legacy`, source branch `main`, path `/`, CNAME `www.projectlantern.net`, and URL `https://www.projectlantern.net/`. DNS resolves that hostname through `mb-projectlantern.github.io`. The Pages settings are not inferred from CNAME alone. GitHub Pages supplies no application server-side authentication or write API here. Account services outside the repository were not assumed to exist.

Implementation is on `lifeos-poc`. Original landing page, favicon, CNAME, and `main` are unchanged. No result data or production secrets belong in the public repository.

## 2. Current capability research

Official sources were opened on 2026-09-24; distinguish normal ChatGPT, ChatGPT Work, and Codex. Do not infer normal ChatGPT write permissions from this Codex session's tools.

| Capability | Confirmed / unsupported / uncertain |
| --- | --- |
| Scheduled Tasks | Confirmed: schedules, monitoring, email/push notifications, supported apps subject to permissions. Approval-requiring actions can pause execution. GPTs are unsupported. Custom outbound HTTP from a normal task was not established. [Tasks](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt) |
| GitHub | Standard GitHub documentation describes read-only repository access, while the broader task docs mention supported app actions. **Observed in this account:** normal ChatGPT successfully created issue 2 interactively and issue 3 during scheduled execution after the private repo was added to its installed app. Treat this as account-specific evidence, not a universal entitlement. [GitHub in ChatGPT](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt) |
| Apps / MCP | Custom MCP servers can expose tools. This does not prove that the user's scheduled task can invoke a custom write tool unattended. No MCP service or paid inference is implemented. [MCP server documentation](https://developers.openai.com/plugins/build/mcp-server) |
| Work / event triggers | Work supports supported incoming Gmail, Slack, and GitHub events. Incoming event support is not a general outbound webhook guarantee. Work is distinct from ordinary Chat. [Work](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex) |
| Email | Task notification email is documented. Full structured result inclusion, sender address, formatting, and delivery frequency need a real sample. A link-only notification is insufficient. Reading email via a connector does not grant background forwarding/processing. [Tasks](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt) |
| API inference | Not used. No OpenAI API key is required. API-only inference is outside this experiment unless separately approved. |

## 3–6. Proposed and implemented architecture, rationale, flow

Selected user preference: a new private `mb-projectlantern/lifeos-results` repository (created and confirmed private; repository ID `1385602767`) as the bridge, with free Cloudflare infrastructure.

Proposed successful path:

```text
Normal ChatGPT monitoring task + normal notification
  → creates a structured issue in PRIVATE lifeos-results (verified in this account)
  → GitHub issues/opened signed webhook
  → /life-os/api/github (HMAC + private repository + author checks)
  → same validated ingestion code used by /life-os/api/results
  → Cloudflare D1 results table
  → authenticated /life-os/ dashboard polling every 30 seconds
```

Actually implemented and deployed: the Worker, two small D1 tables, authenticated API/UI, and signed GitHub webhook. Also implemented: synthetic publisher, real-SQLite local harness, tests, and optional Gmail bridge code. The Gmail fallback is not deployed. No GitHub Actions runner is needed: a repository webhook is smaller and avoids polling or storing a Cloudflare write token in GitHub.

Alternative when normal ChatGPT cannot write issues:

```text
ChatGPT task → its notification email → dedicated Gmail filter/label
  → Apps Script five-minute trigger → authenticated POST → D1 → dashboard
```

This fallback does not require the task to call an app. It works only if email contains the requested structured result. The parser fails visibly for missing/truncated output; it never fabricates an analysis from a notification link. Gmail integration code is a prototype until a real notification validates the format. No paid OpenAI API, browser scraping daemon, or manual result transfer is used.

D1 was chosen for atomic deduplication, indexed newest-first reads, and persistence without operating a server. A single result table plus a small optional email-bridge status table is the entire database. Free Workers and D1 should comfortably cover a five-day experiment.

## 7. Files

- `life-os/worker.js`: authentication, validation, bounded requests, ingestion/read routes, logs.
- `life-os/github.js`: signed private-repository issue bridge.
- `life-os/ui.js`: protected responsive page, CSS, safe text-only rendering, polling.
- `life-os/migrations/0001_results.sql`: result persistence and optional bridge heartbeat.
- `life-os/synthetic.js`: test-data generator and authenticated publisher.
- `life-os/access.ps1`: local helper to copy the DPAPI-protected dashboard password.
- `life-os/bridge/email-parser.js`, `gmail.gs`: optional notification-email fallback.
- `life-os/test/`: SQL adapter, pipeline/security tests, loopback-only preview server.
- `wrangler.jsonc`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: deployment tooling with pinned Wrangler.
- `.gitignore`: excludes dependencies, local secrets, preview data, and logs.
- `LIFE_OS_POC.md`: audit, setup, exact experiments, and evidence.
- `life-os/access.ps1`, `life-os/initialize-access.ps1`, `life-os/credentials.ps1`: verified dashboard credential retrieval, recovery/bootstrap, and encrypted local storage.
- `life-os/test/credentials.test.js`: isolated Windows credential workflow regression tests.

The repository has a source directory named `life-os`, but no static `life-os/index.html` or public result file. The actual route is served by the Worker. Merging source into Pages alone cannot deploy the private dashboard.

## 8–11. Deployment, authentication, secrets, services

Required: existing ChatGPT subscription, GitHub private repository, Cloudflare **Free** account with Workers and D1. Optional: Gmail and Apps Script for fallback. No paid plan selection is needed.

Use Node 22.13+ and pnpm. On this machine Node 24.19.0 is available; pnpm lives in the bundled runtime. A normal workstation can use its installed pnpm.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec wrangler login --scopes account:read user:read workers:write workers_routes:write workers_scripts:write workers_tail:read d1:write zone:read
pnpm exec wrangler d1 create life-os-poc
# Put the returned non-secret database ID in wrangler.jsonc.
pnpm exec wrangler d1 migrations apply life-os-poc --remote
pnpm exec wrangler secret put DASHBOARD_USER
pnpm exec wrangler secret put DASHBOARD_PASSWORD
pnpm exec wrangler secret put INGEST_TOKEN
pnpm exec wrangler secret put GITHUB_WEBHOOK_SECRET
pnpm exec wrangler deploy
```

These deployment commands are for initial infrastructure setup; do not rerun them to repair local dashboard access. Enter secret values at CLI prompts or use a protected secret manager; never put them in command arguments, source, issues, task prompts, or commits. Wrangler stores its own OAuth credential outside these repositories. Use independently generated high-entropy values for the password and both tokens (32 random bytes encoded as hex is sufficient). Set `DASHBOARD_USER` to `lantern`. Worker refuses service when core credentials are absent/too short. After initial deployment, run `initialize-access.ps1` as described above and enter the same dashboard password to provision the encrypted local credential. Keep that password in a password manager for another machine; deployment alone does not create a local DPAPI file.

| Setting | Where / purpose |
| --- | --- |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | Worker secrets; server-side HTTP Basic authentication over HTTPS for page/assets/read API. Password minimum 24 characters; use random values. |
| `INGEST_TOKEN` | Separate Worker secret, minimum 32 characters; write-only bearer API credential. Never sent to dashboard JS. Optional Gmail Script Property. |
| `GITHUB_WEBHOOK_SECRET` | Worker secret and private repo webhook configuration; minimum 32 characters. No repository file stores it. |
| `GITHUB_REPOSITORY_ID` | Non-secret Worker variable, pinned to the private repo ID. |
| `GITHUB_ACTOR` | Non-secret allowlisted GitHub login; initially `mb-projectlantern`. A different bot requires a deliberate allowlist change. |
| `DB` | D1 binding. Database ID/account ID are identifiers, not credentials. |
| `LIFE_OS_URL` | Shell/Apps Script setting containing origin only; no embedded credentials. |

HTTP Basic is real server-side protection. There is no embedded JavaScript password, public data JSON, client-side gate, or cross-origin read permission. All results render via `textContent`, with CSP/no-store headers. Basic authentication has browser-managed credential caching and no logout button; close the private browsing session or clear credentials to log out. Rate limiting and stronger identity management are production improvements. Synthetic local credentials in tests are never accepted in production unless someone deliberately configures them.

Initial cloud smoke test should use the returned `workers.dev` origin. To satisfy the exact public-site path, add `projectlantern.net` to Cloudflare Free DNS, preserve **all** existing DNS records (especially mail records), set the `www` CNAME to the existing GitHub Pages target with proxying, use Full (strict) TLS, and route only `www.projectlantern.net/life-os*` to this Worker. Leave `/` and every other existing site path on Pages. [Worker route requirements](https://developers.cloudflare.com/workers/configuration/routing/routes/). A nameserver change at the registrar may require the user; the POC has not silently changed DNS. Do not route the entire site to the Worker. If using Wrangler routes, set `workers_dev` explicitly according to whether the protected preview origin should remain available.

Configure the private repository webhook at Settings → Webhooks: payload URL `https://YOUR_WORKER_OR_DOMAIN/life-os/api/github`, content type `application/json`, SSL verification enabled, secret as above, **Issues** events only. Receiver accepts only new issues with title prefix `[life-os]`, configured private repo ID, and allowlisted sender/author. Body must be one JSON object, no code fences. Retries use `github:repository-id:issue-number` for deduplication. Edits are ignored; create a new issue for a new execution. GitHub origin does not cryptographically prove ChatGPT authorship, so the source label says that origin is unverified. Confirm it by matching the actual task run during the experiment.

## 12. Cost and limits

Current official free allowances: Workers 100,000 requests/day and 10 ms CPU/invocation; D1 5 million rows read/day, 100,000 written/day, 5 GB account storage. One tab polling all day makes about 2,880 reads; newest-results query is capped at 100 rows. Keep the account on Free; do not enable paid upgrades. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Gmail Apps Script consumer quotas currently include 20,000 email reads/writes/day, 20,000 URL fetches/day, and 90 minutes/day trigger runtime; a run is limited to six minutes. The prototype scans at most 50 labeled threads in a seven-day lookback and deduplicates at ingestion. This is intentionally bounded to the five-day POC. [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas). Existing subscription and domain costs are excluded. ChatGPT plan usage still applies; no inference billing is introduced.

## 13. Synthetic pipeline procedure

Local checks:

```sh
pnpm test
node life-os/test/preview.js
```

Open `http://127.0.0.1:8787/life-os/`, sign in with user `preview` and the explicit **local-only** password printed by the preview server. It binds to loopback only and stores synthetic data in ignored `test-output/preview.sqlite`. Never tunnel this harness. Tests verify SQLite reopen persistence, duplicates, sorting, actual UI code, auth boundaries, failed storage, malformed input, webhook signatures/privacy/actor checks, and complete-vs-link-only email parsing. They do not replace a real Cloudflare deployment test.

For deployed ingestion, set `LIFE_OS_URL` and `INGEST_TOKEN` securely in your shell and run `node life-os/synthetic.js`. Expect HTTP 201, then a NEEDS ATTENTION card with the exact supplied summary and source TEST DATA. For the GitHub path, create an issue with title `[life-os] Life OS Integration Test` and the same JSON from `synthetic()`; this tests the bridge, not ChatGPT intelligence. Expect GitHub delivery 201 (200 for a redelivery), a matching `external_id`, and exactly one card after replay.

## 14. Interactive ChatGPT test (A)

In **normal ChatGPT**, with access to the private repository, use:

> This is a Life OS integration test, not an investing recommendation. Use an available authorized GitHub write action to create exactly one issue in the PRIVATE repository mb-projectlantern/lifeos-results. Title: [life-os] Interactive ChatGPT Test. Body must be a single JSON object, without Markdown fences: task_name="Life OS Integration Test", task_type="monitor", subject="AMZN", status="TEST", requires_attention=true, summary="Synthetic test result. If this appears, the Life OS ingestion and display pipeline is operational.", details="Interactive ChatGPT integration test; not a scheduled execution.", source="TEST DATA", execution_time=current UTC time as ISO 8601. Never include credentials. If this ChatGPT experience cannot write issues, say so explicitly; do not claim you published and do not ask me to manually transfer the result.

Record the actual chat, issue URL, webhook delivery status, stored result ID, and dashboard display. An issue created by this Codex development session is not Test A. If normal ChatGPT lacks write access, optionally test ChatGPT Work separately and label it **Work**, not ordinary Chat. Do not represent a Codex automation as a scheduled ChatGPT Task.

## 15–16. Scheduled task experiment (B/C), exact prompt, expected result

First run a single scheduled synthetic issue-write test two minutes in the future using the Test A body and task name `Scheduled Life OS Integration Test`; require a scheduled-task confirmation card and matching unattended delivery. If an approval pause occurs each run, unattended operation has not passed. Do not create a five-day monitor until the one-off path works.

After that succeeds, use this bounded AMZN prompt (dates are explicit for this audit):

> Create a monitoring task named LIFEOS-AMZN-POC. Run at 08:30 and 15:30 America/New_York on September 25, 28, 29, 30 and October 1, 2026, then stop. These are the next five intended US trading days after September 24; verify the exchange calendar and skip any market closure. Monitor Amazon (AMZN) using available current sources. Assess price movement, unusual volume, earnings/guidance, filings, and material company news. Cite sources and their timestamps. Distinguish stale or unavailable market data from a normal result, and do not invent prices or volume. Compare against previous runs and avoid repeating unchanged news. Notify me only when a new development materially warrants attention, explaining why; no routine completion alerts. On each completed execution, use an authorized GitHub write action to create one issue in PRIVATE mb-projectlantern/lifeos-results with title [life-os] AMZN followed by the UTC execution timestamp. The body must be only a JSON object with task_name="AMZN Monitor", task_type="monitor", subject="AMZN", status="completed" or "data_unavailable", requires_attention as a Boolean, summary, details including source URLs and limitations, source="ChatGPT", and execution_time as an ISO 8601 UTC timestamp. Do not include secrets. Do not trade. If the issue action is unavailable or pauses for approval, report that integration limitation honestly; do not claim publication. Confirm the schedule and final stop condition before starting.

A task-produced private issue flowing automatically to the dashboard is **WORKAROUND SUCCESS**, not direct success. A successful interactive issue with no scheduled publication is **PARTIAL SUCCESS**. Routine publication can include NORMAL cards while attention notifications remain selective, subject to ChatGPT's actual notification controls. Unsupported schedule granularity must be reported, not approximated silently.

If GitHub writes are unavailable, attempt the email fallback rather than stopping:

1. Enable task email notifications and identify the actual sender from a genuine task notification. Do not guess the sender.
2. Create a private Apps Script project containing `gmail.gs` and `email-parser.js`. Script Properties: origin-only `LIFE_OS_URL`, secret `INGEST_TOKEN`, exact `EXPECTED_SENDER`, `SOURCE_LABEL`.
3. Create a Gmail filter matching that sender and task subject `LIFEOS-AMZN-POC`; apply the dedicated label. Authorize Gmail/URL Fetch access and create a five-minute trigger for `pollLifeOsMail`. Credentials remain in private Script Properties.
4. Run a one-time scheduled synthetic task with its entire result between `LIFE_OS_RESULT_BEGIN` and `LIFE_OS_RESULT_END`, containing the same JSON fields above. Confirm the email has the complete block and passes Gmail authentication.
5. For the five-day prompt above, replace the issue-writing sentence with: “For each materially noteworthy update, include the complete JSON result in your notification output between the literal lines LIFE_OS_RESULT_BEGIN and LIFE_OS_RESULT_END. A separate email processor publishes it to Life OS. You are not directly calling Life OS. Do not claim successful publication.”
6. Verify email message ID → Apps Script execution → `gmail:message-id` row → card. Missing marker, truncated email, or link-only email is a failed bridge experiment. NORMAL runs may not generate email when notifications are suppressed; this fallback publishes delivered actionable results, not guaranteed every execution.

## 17. Troubleshooting and observability

| Observation | Check next |
| --- | --- |
| No ChatGPT output | Scheduled task status, stop date, account limits, required approvals. No downstream system can distinguish this from a quiet monitor without checking the task. |
| Output but no issue | ChatGPT write-action availability and repository authorization; compare Chat vs Work. |
| Issue exists but no row | GitHub webhook Recent deliveries; missing delivery means configuration problem. 401 means signature, 403 means repo/privacy/author, 400 means malformed result, 503 means configuration/storage. Redeliver the original opened event after correction. |
| No email | Task notification settings and Gmail delivery/filter. A quiet monitor can legitimately send nothing. |
| Email exists but no row | Apps Script Executions; sender/DMARC, markers, JSON, trigger status, quota, HTTP result. Link-only email cannot pass. |
| Ingestion returned 503 | Worker logs by request_id and stage; D1 binding/migration/free quota. Bodies and secrets are not logged. |
| Row exists but no card | Authenticated GET `/life-os/api/results`, browser error, page's last-check timestamp; newest 100 limit. |
| Duplicate delivery | HTTP 200/duplicate with original ID; no new card. |
| Dashboard 401 / 503 | Authentication / missing configuration respectively. All routes fail closed. |

Every stored row has source, server received time, external identifier, and processing_status=stored. Worker logs record request ID, stage, status, internal result ID and webhook delivery identifier where available. Failed attempts stay in service logs, not as fake results. Optional email heartbeat includes last poll/error; it is not evidence of a completed ChatGPT run. GitHub is event-driven and does not emit periodic heartbeats.

## 18–19. Limitations and production changes

No real financial recommendations or trading actions are implemented. The task prompt cannot guarantee market data quality, app permissions, or delivery. GitHub writes were verified for this account and may differ by account/product surface or change later. Email formatting is undocumented and may change. No connector is assumed available merely because Codex has a similar tool.

For production: identity provider/MFA and session logout, rate limiting, structured retention/deletion/export, backups, automated webhook redelivery/reconciliation, durable error records and alerts, a stronger signed provenance contract, JSON schema/versioning, broader browser testing, and monitoring for quota/permission changes. This POC deliberately omits those systems. Results currently persist until explicitly removed; only the newest 100 display. Never expose the local test server or reuse its public fixture credentials. No production secret is committed to either repository.
