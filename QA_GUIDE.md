# API Request Inspector — QA One-Pager

A tool to **capture, inspect, replay, compare, and export** an app's API traffic — straight into JMeter. Built for testing real user flows without re-typing requests.

---

## Setup (one time)
1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the extension folder.
2. Open it one of two ways:
   - **DevTools panel:** press **F12** → **API Inspector** tab (watches the current tab).
   - **Inspector Window:** click the extension icon → **Open Inspector Window** (pick *any* tab to watch).

---

## The 4 things QA does most

### 1. Capture a flow
- **Window:** pick the tab in **"Listening to:"** → click **⟳ Reload tab** → run the feature in the app.
- **Panel:** just have it open, then run the feature.
- Filter to **Fetch/XHR** to hide JS/CSS/images. Use the search box (More filters) to find by URL.
- **📌 Pin** the requests you care about so **Clear** won't remove them.

### 2. Reproduce / verify a bug
- Click the request → check **Method, URL, Headers, Body** and the **Response** (Body / Headers / Cookies tabs).
- Edit any field → **Send Request** (runs with the real session/cookies) to confirm what triggers the bug.
- **Reset** to undo edits.

### 3. Catch a regression
- Capture the response **before** a deploy, capture again **after**.
- **⚖️ Compare** → pick both → side-by-side diff (added / removed / changed highlighted).

### 4. Build a load test (JMeter)
- Filter to **Fetch/XHR** (so you export only API calls).
- **⬇ Export → Export all → .jmx** → open the file in JMeter (File → Open).
  - You get one HTTP sampler per request, with headers and **form fields as proper JMeter parameters**.
- Prefer pasting? **⬇ Export → Copy all as cURL**, then JMeter → **Tools → Import from cURL** → paste.

---

## Handy extras
- **Environments:** define `baseUrl` per env (Dev/Staging/Prod) and use `{{baseUrl}}/path` in requests; switch env from the dropdown.
- **Saved requests:** save a request with a name + collection to reload later.
- **Copy as cURL** (single) for bug tickets so devs can run the exact call.
- **Dark/Light** theme toggle (remembered).

---

## Gotchas (read before reporting issues)
- **Window capture starts after you attach** → always click **⟳ Reload tab** first, or you'll see 0 requests.
- The watched tab shows a yellow **"…debugging this browser"** banner while attached — normal; gone on **Detach**.
- You **can't attach the window to a tab that already has DevTools open** (one debugger per tab) — the status bar says why.
- The **panel only shows requests captured while it's open** (same as Chrome's Network tab).
- On **export**, `content-length`/`host` and HTTP/2 `:` headers are dropped on purpose (JMeter/cURL recompute them).
- Only test apps you're **authorized** to test — capture/replay use the real logged-in session.

---

## Quick reference
| Goal | Action |
|------|--------|
| Watch a specific tab | Inspector Window → **Listening to:** → **⟳ Reload tab** |
| Show only API calls | **Fetch/XHR** chip |
| Keep a request through Clear | **📌 Pin** it |
| Re-run with edits | Select → edit → **Send Request** |
| Before/after diff | **⚖️ Compare** |
| To JMeter (file) | **⬇ Export → Export all → .jmx** |
| To JMeter (paste) | **⬇ Export → Copy all as cURL** → JMeter *Import from cURL* |
| Share with a dev | **⬇ Export → Copy selected as cURL** |
