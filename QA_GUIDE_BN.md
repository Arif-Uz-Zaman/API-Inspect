# API Request Inspector — QA Guide (বাংলা + English)

একটি টুল যা দিয়ে আপনারা যেকোনো web app-এর **API traffic capture, inspect, replay, compare এবং JMeter-এ export** করতে পারবেন — real user flow test করার জন্য, request গুলো manually type না করেই।

---

## Setup (একবার করলেই হবে)
1. `chrome://extensions`-এ যান → **Developer mode** on করুন → **Load unpacked** → extension folder টি select করুন।
2. টুলটি দুইভাবে খুলতে পারবেন:
   - **DevTools panel:** **F12** চাপুন → **API Inspector** tab (current tab-এর traffic দেখাবে)।
   - **Inspector Window:** extension icon-এ click করুন → **Open Inspector Window** (*যেকোনো* tab choose করে দেখতে পারবেন)।

---

## QA রা যে ৪টি কাজ সবচেয়ে বেশি করে

### ১. একটি flow capture করা
- **Window:** "Listening to:" থেকে tab টি select করুন → **⟳ Reload tab**-এ click করুন → তারপর app-এ feature টি চালান।
- **Panel:** শুধু open রাখুন, তারপর feature টি run করুন।
- শুধু API call দেখার জন্য **Fetch/XHR** chip-এ click করুন (JS/CSS/image hide হয়ে যাবে)। URL দিয়ে খুঁজতে search box (More filters) ব্যবহার করুন।
- যে request গুরুত্বপূর্ণ, সেটি **📌 Pin** করে রাখুন — তাহলে **Clear** করলেও সেটি থেকে যাবে।

### ২. Bug reproduce / verify করা
- Request-এ click করুন → **Method, URL, Headers, Body** এবং **Response** (Body / Headers / Cookies tab) check করুন।
- যেকোনো field edit করে **Send Request** করুন (real session/cookies দিয়ে চলে) — bug টি কীসে হচ্ছে তা confirm করার জন্য।
- Edit undo করতে **Reset** চাপুন।

### ৩. Regression ধরা
- Deploy-এর **আগে** response টি capture করুন, deploy-এর **পরে** আবার capture করুন।
- **⚖️ Compare** → দুইটি select করুন → side-by-side diff (added / removed / changed highlight হয়ে দেখাবে)।

### ৪. Load test বানানো (JMeter)
- আগে **Fetch/XHR** filter করুন (যাতে শুধু API call export হয়)।
- **⬇ Export → Export all → .jmx** → file টি JMeter-এ খুলুন (File → Open)।
  - প্রতিটি request-এর জন্য আলাদা HTTP sampler পাবেন, header সহ, এবং **form field গুলো proper JMeter parameter** হিসেবে।
- Paste করতে চাইলে? **⬇ Export → Copy all as cURL**, তারপর JMeter → **Tools → Import from cURL** → paste করুন।

---

## কিছু কাজের extra feature
- **Environments:** প্রতিটি env (Dev/QA/Staging/Prod)-এর জন্য `baseUrl` define করুন, এবং request-এ `{{baseUrl}}/path` ব্যবহার করুন; dropdown থেকে env switch করুন।
- **Saved requests:** request কে name + collection দিয়ে save করে রাখুন, পরে reload করা যাবে।
- **Copy as cURL** (single) — bug ticket-এ দিলে dev রা exact call টি run করতে পারবে।
- **Dark/Light** theme toggle (মনে রাখে)।

---

## Gotchas (issue report করার আগে পড়ুন)
- **Window-এর capture attach করার পর থেকে শুরু হয়** → তাই আগে অবশ্যই **⟳ Reload tab**-এ click করুন, না হলে 0 request দেখাবে।
- যে tab watch করছেন সেটিতে হলুদ **"…debugging this browser"** banner আসবে — এটি normal; **Detach** করলে চলে যাবে।
- যে tab-এ **already DevTools open**, সেই tab-এ window attach হবে না (এক tab-এ একটি debugger) — status bar-এ কারণ দেখাবে।
- **Panel শুধু সেই request গুলো দেখায় যেগুলো panel open থাকা অবস্থায় capture হয়** (Chrome-এর নিজের Network tab-এর মতো)।
- **Export** করার সময় `content-length`/`host` এবং HTTP/2-এর `:` header গুলো ইচ্ছা করে বাদ দেওয়া হয় (JMeter/cURL নিজেই এগুলো calculate করে)।
- শুধু সেই app test করবেন যেটি test করার **authorization** আপনার আছে — capture/replay real logged-in session ব্যবহার করে।

---

## Quick reference
| কী করতে চাই | Action |
|------|--------|
| নির্দিষ্ট tab watch করা | Inspector Window → **Listening to:** → **⟳ Reload tab** |
| শুধু API call দেখা | **Fetch/XHR** chip |
| Clear করার পরেও request রাখা | **📌 Pin** করুন |
| Edit করে আবার run করা | Select → edit → **Send Request** |
| আগে/পরে diff | **⚖️ Compare** |
| JMeter-এ নেওয়া (file) | **⬇ Export → Export all → .jmx** |
| JMeter-এ নেওয়া (paste) | **⬇ Export → Copy all as cURL** → JMeter *Import from cURL* |
| Dev কে share করা | **⬇ Export → Copy selected as cURL** |
