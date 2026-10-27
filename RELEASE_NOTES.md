# API Request Inspector & Resender — Release Notes

**Version:** 1.0.0
**Type:** Chrome Extension (Manifest V3)
**Date:** 2026-06-17

A developer/QA tool to **capture, inspect, edit, replay, compare, and export** the HTTP API traffic of any web app — from inside Chrome DevTools *or* a standalone window that can target any open tab.

---

## 1. What's in this release

### 🪟 Two ways to run it
| Mode | How to open | Targets | Best for |
|------|-------------|---------|----------|
| **DevTools panel** | F12 → **API Inspector** tab | The current tab | Quick inspection while you're already in DevTools |
| **Standalone window** | Extension icon → **Open Inspector Window** | **Any tab you pick** | Watching a tab while working elsewhere; driving traffic against a specific tab |

The standalone window adds a **"Listening to:" tab picker** — choose any open tab, and the window attaches to it (via the Chrome debugger), captures its requests live, and replays requests back into *that* tab. A **⟳ Reload tab** button reloads the target so its full page-load traffic is captured.

### 🔍 Live request capture
- Captures **fetch** and **XHR** traffic, plus all resource types via the network layer.
- **Full on-the-wire headers** — including `cookie`, `content-length`, `sec-fetch-*`, and other headers the browser adds automatically (merged from Chrome's extra-info events).
- Request/response bodies, status, duration, and timing.
- **CSP-safe**: the page interceptor runs in the page's MAIN world, so it no longer trips "inline script violates Content Security Policy" errors on strict sites.

### 🎛️ Modern filter bar (DevTools-style)
- Resource-type chips: **All · Fetch/XHR · Doc · CSS · JS · Font · Img · Media · Manifest · Socket · Wasm · Other** (multi-select).
- **More filters** dropdown: free-text URL/method search, method filter, and "Hide data: URLs".
- **📌 Pin** important requests so they survive "Clear".

### ✏️ Request editor + resend
- Edit **method, URL, headers (JSON), and body** then **Send Request** — runs in the real page context with its cookies/session.
- Tabbed response viewer: **Body** (JSON syntax-highlighted), **Headers**, **Cookies**.
- **Reset** to revert edits; toggle "Include cookies".

### 🌐 Environments & variables
- Define environments (e.g. *Dev / Staging / Prod*) with variables like `baseUrl`.
- Use `{{baseUrl}}/users` style placeholders in URL, headers, and body — substituted at send time.

### 💾 Saved requests
- Save any request with a **name, collection, and description**; reload it into the editor later. Grouped by collection.

### ⚖️ Compare responses
- Side-by-side line diff of two captured responses (added/removed/changed highlighting) — great for spotting regressions.

### ⬇️ Export to cURL & JMeter
- **Copy as cURL** (single) and **Copy all as cURL** (bulk, one per line — pastes into JMeter's *Import from cURL*).
- **Export to `.jmx`** (selected or all) — generates a ready-to-open JMeter test plan:
  - HTTP Request samplers + per-request HTTP Header Managers.
  - **Form-urlencoded bodies are split into individual JMeter parameters** (name/value rows), so payloads import correctly.
  - JSON/other bodies kept as raw post body with the right Content-Type.
  - Volatile headers (`content-length`, `host`, HTTP/2 pseudo-headers) stripped so the tool recomputes them.

### 🎨 UX
- Refreshed modern UI, light/dark theme toggle (remembered across sessions).

---

## 2. When to use this tool (use cases)

### For QA / Test Engineers
- **Build load tests fast** — capture a real user flow, filter to **Fetch/XHR**, then **Export all → .jmx** and open in JMeter. No manual request re-typing.
- **Reproduce a bug** — capture the exact failing request (with full headers/cookies), tweak a field, and resend to confirm the trigger.
- **Regression checks** — capture a response before a deploy, capture again after, and **Compare** to see what changed.

### For Developers
- **Debug API integrations** — inspect the exact payload/headers your front-end sends vs. what you expected.
- **Iterate on an endpoint** — edit body/headers and **Send Request** repeatedly without touching the app code or Postman.
- **Share a repro** — **Copy as cURL** and paste into a ticket so anyone can run the same call.
- **Multi-environment testing** — keep `{{baseUrl}}` in saved requests and switch environments to hit Dev/Staging/Prod.

### For Performance / SRE
- **Seed a performance test** from production-like traffic captured in the standalone window targeting a specific tab/session.
- **Audit what a page loads** — use the resource chips to see how many JS/Img/Font/Media requests a page fires.

### For Support / Analysts
- **Verify a workflow** — attach the standalone window to a user's reproduction tab, reload, and capture the calls behind a feature (e.g. a report or download).
- **Document an API** — save representative requests into named collections as living examples.

### Typical end-to-end flow
1. Open the **Inspector Window**, pick the target tab, click **⟳ Reload tab**.
2. Drive the feature in the app (e.g. click *View* on a report).
3. Filter to **Fetch/XHR**, select the key request.
4. Inspect headers/body/response; pin it.
5. Edit + **Send Request** to experiment, or **Compare** against another capture.
6. **Export all → .jmx** (or **Copy all as cURL**) to hand off to JMeter for load testing.

---

## 3. Setup

1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the extension folder.
3. Use it via **F12 → API Inspector**, or the toolbar icon → **Open Inspector Window**.

**Permissions used:** `tabs`, `cookies`, `storage`, `webRequest`, `debugger`, host access to all URLs — required for capturing traffic, attaching to a chosen tab, reading cookies for replay, and persisting environments/saved requests.

---

## 4. Notes & limitations

- The standalone window uses the Chrome debugger, so the target tab shows a yellow **"…started debugging this browser"** banner while attached — this is expected and disappears on **Detach** / window close.
- A tab can't be attached if **its DevTools is already open** (one debugger per tab). The status bar reports the reason.
- Debugger capture only sees traffic **after** attaching — use **⟳ Reload tab** to capture the full page load.
- HTTP/2 pseudo-headers (`:authority`, `:path`, …) aren't always exposed by the debugger; they're stripped on export anyway and don't affect replay.
- Capture/replay run with the target tab's real session/cookies — only use against apps you're authorized to test.
