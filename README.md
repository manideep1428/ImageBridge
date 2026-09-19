# AI Image Generation REST API Server (ChatGPT & Gemini)

A high-performance Express REST API server and automated browser engine for generating AI images using **ChatGPT** (DALL-E 3 / GPT-4o Image Model) and **Gemini** (Imagen 3), featuring dual-tier storage (**Local Server Disk** & **Bunny CDN Edge Storage**).

---

> [!CAUTION]
> ### ⚠️ Important Disclaimer & Account Safety Warning
> This project interacts with AI web interfaces through automated browser sessions. Automated queries and high-frequency requests may violate the platform provider's **Terms of Service (ToS)**.
> - **Use responsibly and at your own risk.**
> - Apply reasonable request intervals and avoid spamming, aggressive concurrency, or abusive volume.
> - Excessive or abusive automation may lead to temporary rate-limiting, CAPTCHA challenges, or **account suspension/ban** from the respective AI service.

---

## 🌟 Key Features

- 🤖 **Multi-Model Support**: Generate AI images seamlessly with **ChatGPT** and **Google Gemini**.
- 🔐 **Persistent Browser Session Profiles**: Log in once interactively; session cookies and tokens are safely persisted locally in `chatgpt-profile/` or `gemini-profile/` (automatically created, never committed to Git).
- 💾 **Dual-Tier Storage Engine (Local + Bunny CDN)**:
  - **Local Only (`STORAGE_MODE=local`)**: Saves directly to host disk (`./outputs/`) and serves via Express static HTTP URL (`http://localhost:3001/outputs/...`). No cloud account required!
  - **Bunny CDN Only (`STORAGE_MODE=bunny`)**: Uploads directly to global Bunny Storage edge network.
  - **Server + Bunny (`STORAGE_MODE=both`)**: Dual-saves locally on the host server and uploads to Bunny CDN simultaneously.
- ⚡ **REST API Endpoints**: Clean, standardized endpoints for text-to-image and image-to-image generation.
- 🖱️ **Human-Like Input**: The pointer travels a random cubic Bézier path timed by **Fitts' law** and prompts are typed key by key, ported from the [rewards-farmer](https://github.com/User0332/rewards-farmer) project. Toggle with `HUMAN_INPUT` / `HUMAN_TYPING`.
- 🐳 **Docker Ready**: `docker compose up -d --build` runs the API headlessly with the browser profiles and outputs mounted from the host.
- 🛠️ **Configurable Port**: Change port dynamically via `PORT` in `.env`.
- 🛡️ **Airtight Git Privacy**: `.gitignore` strictly protects your browser profile data, session credentials, private prompts, and environment secrets from being pushed to Git.

---

## 🏗️ How It Works (System Architecture)

```
                       +-----------------------------------+
                       |    Client App / Frontend / cURL   |
                       +-----------------+-----------------+
                                         |
                                (HTTP POST / API)
                                         v
                       +-----------------------------------+
                       |    Express REST API Server        |
                       |       (Configurable PORT)         |
                       +-----------------+-----------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
             [ ChatGPT Provider ]                 [ Gemini Provider ]
             (Playwright + Stealth)               (Playwright + Stealth)
                       |                                   |
            (Uses chatgpt-profile/)              (Uses gemini-profile/)
                       |                                   |
                       +-----------------+-----------------+
                                         |
                           [ Extracted Image Data Buffer ]
                                         |
                                         v
                         +---------------+---------------+
                         |        Storage Manager        |
                         +---------------+---------------+
                                         |
                 +-----------------------+-----------------------+
                 | (STORAGE_MODE: local) | (STORAGE_MODE: bunny) |
                 v                       v                       v
      +---------------------+ +---------------------+ +---------------------+
      |  Local Server Disk  | |   Bunny.net CDN     | |     Both Modes      |
      |   (./outputs/...)   | |  (Edge Storage Zone)| |  (Local + Bunny CDN)|
      +---------------------+ +---------------------+ +---------------------+
                 |                       |                       |
                 +-----------------------+-----------------------+
                                         |
                             [ JSON Response Payload ]
                             {
                               "success": true,
                               "jobId": "gen_...",
                               "provider": "chatgpt",
                               "url": "https://... or http://...",
                               "cdnUrl": "https://your-zone.b-cdn.net/...",
                               "localUrl": "http://localhost:3001/outputs/..."
                             }
```

1. **API Request**: The client sends a prompt and optional reference image to the Express API.
2. **Browser Engine**: Playwright opens a browser context utilizing the persistent session profile (saved from your initial one-time login).
3. **AI Generation**: Prompts and attachments are submitted to the web interface; the engine detects generation progress and extracts the generated image buffer.
4. **Storage Orchestration**: The buffer is saved to local server disk (`./outputs/`) and/or uploaded to Bunny CDN according to `STORAGE_MODE`.
5. **Response**: The API responds with the job ID and accessible image URLs.

---

## 🚀 Local Environment Setup (Step-by-Step)

### Step 1: Install Dependencies
Ensure you have **Node.js 18+** or **Bun** installed:

```bash
# Using npm
npm install

# Install Playwright browser binaries
npx playwright install chromium
```

*(Or using Bun: `bun install && bunx playwright install chromium`)*

---

### Step 2: Configure Environment Variables (`.env`)

Copy the example configuration file:

```bash
cp .env.example .env
```

Open `.env` and configure your settings:

```env
# Server Port
PORT=3001

# Storage mode: 'local' (no bunny required), 'bunny', or 'both'
STORAGE_MODE=local

# Default AI provider: 'chatgpt' or 'gemini'
AI_PROVIDER=chatgpt

# Playwright Browser (Keep false locally to see the browser window if needed)
HEADLESS=false
```

---

### Step 3: One-Time Interactive Session Login

Before running automated generations, authenticate once so your browser session cookies are saved:

#### For ChatGPT:
```bash
npm run login:chatgpt
```

#### For Gemini:
```bash
npm run login:gemini
```

**What happens:**
1. A visual Google Chrome window will open to ChatGPT or Gemini.
2. Log in using your email and password (or Google login).
3. Once logged in, the script detects the session and saves session cookies into the local `chatgpt-profile/` (or `gemini-profile/`) folder.
4. Close the browser. **You do not need to log in again**—subsequent runs will reuse this authenticated session!

> [!NOTE]
> All profile directories (`chatgpt-profile/`, `gemini-profile/`) are **strictly gitignored** and will never be pushed to version control.

---

### Step 4: Start the Express API Server

```bash
# Start server in watch mode
npm run server

# OR standard start
npm start
```

You should see the server startup banner:

```
================================================================
🚀 [AI Image Generation Express REST API Server]
Running on http://localhost:3001
================================================================
  - Default Provider:        CHATGPT
  - Storage Mode:            LOCAL
  - Local Outputs Directory: .../outputs
  - Health Check:            GET  http://localhost:3001/health
  - Static Outputs URL:      GET  http://localhost:3001/outputs/<filename>
  - ChatGPT Generation API:  POST http://localhost:3001/api/generate/chatgpt
  - Gemini Generation API:   POST http://localhost:3001/api/generate/gemini
  - Generic Generation API:  POST http://localhost:3001/api/generate
----------------------------------------------------------------
⚠️  DISCLAIMER & RESPONSIBLE USE:
Use browser sessions responsibly. Excessive automated queries or
misuse may violate platform terms of service and risk account ban.
================================================================
```

---

## 🗄️ Storage Modes Breakdown

Configure `STORAGE_MODE` in `.env`:

| Mode | `STORAGE_MODE` | Requires Bunny Account? | Description |
| :--- | :--- | :--- | :--- |
| **Local Only** | `local` | ❌ No | Saves to `./outputs/` on host disk. Accessible at `http://localhost:3001/outputs/...`. Ideal for local dev or private server hosting. |
| **Bunny CDN Only**| `bunny` | ✅ Yes | Uploads directly to Bunny Storage edge zone. Returns fast global CDN URLs (`https://<zone>.b-cdn.net/...`). |
| **Server + Bunny**| `both` | ✅ Yes | Dual saves to local host disk AND uploads to Bunny CDN. Returns both `localUrl` and `cdnUrl`. |

---

## 🐰 Bunny Storage & CDN Setup Guide

If you want to use Bunny CDN for global image delivery:

### Step 1: Create a Storage Zone on Bunny.net
1. Log into your [Bunny.net Dashboard](https://panel.bunny.net).
2. Navigate to **Storage** > Click **Add Storage Zone**.
3. Name your Storage Zone (e.g. `my-image-app`).
4. Select your primary storage region (e.g. `Falkenstein - EU` or `New York - US`).
5. Click **Add Storage Zone**.

### Step 2: Create a Linked Pull Zone (CDN)
1. On the Storage Zone overview page, click **Connect Pull Zone** or enable the linked CDN Pull Zone.
2. Note your Pull Zone hostname (e.g. `https://my-image-app.b-cdn.net`).

### Step 3: Get your API Access Key (Password)
1. Inside your Storage Zone, click **FTP & API Access** on the left menu.
2. Copy the **Password / API Access Key**.

### Step 4: Configure `.env`
Update your `.env` file with your Bunny credentials:

```env
STORAGE_MODE=both

BUNNY_STORAGE_ZONE=my-image-app
BUNNY_STORAGE_PASSWORD=your_api_access_key_password
BUNNY_CDN_URL=https://my-image-app.b-cdn.net
BUNNY_STORAGE_REGION_HOST=storage.bunnycdn.com
```

---

## 🖱️ Human-Like Pointer, Typing & Ban Risk

Every click this server makes travels the way a hand does. The equations come
from [rewards-farmer](https://github.com/User0332/rewards-farmer)
(`src/mouse_trajectory.py`, `src/fitts_law.py`, `src/mimic_typing.py`), ported
onto Playwright and applied to **both** ChatGPT and Gemini. The REST API is
unchanged.

### Why an automated click is easy to spot

A `locator.click()` is not a click. Playwright resolves the element, reads its
box, jumps the mouse to that exact coordinate in one event, then presses and
releases with no delay. A detector needs nothing clever to see it:

| What a detector looks for | What plain automation produces |
| --- | --- |
| A movement path | One event, from wherever the pointer was to the target |
| Realistic timing | Zero elapsed time regardless of distance |
| Trial-to-trial variation | Byte-identical on every run |
| Aiming error | Every landing point is the exact centre |
| Button hold time | `mousedown` and `mouseup` in the same millisecond |
| Text entry | One `insertText`, no `keydown`/`keyup` sequence |
| A plausible start point | Every move starts from a fixed corner |

Each of those is weak evidence on its own. Together, in one session, they say
"script" with certainty.

### The pointer: every equation and what it buys

| Step | Implementation | What it removes |
| --- | --- | --- |
| **1. Start where the pointer is** | Position is tracked in the page (`window.cursorX/cursorY` on every `mousemove`), persisted to `localStorage`, and reinstalled after each navigation. | Moves that all begin at the same origin. |
| **2. Aim like a person** | `chooseTargetInElement` picks a random point in the middle half of the box: x ∈ [25%, 75%], y ∈ [25%, 75%]. | Pixel-perfect centre clicks. |
| **3. Take the right amount of time** | Fitts' law, `MT = a + b · ID` with `ID = log2(2D / W)` and `W = (height + width) / 2`; `a = 0.55`, `b = 0.1276`, measured from real click trials. | Instant movement, and any fixed per-click delay. |
| **4. Take a curved route** | A cubic Bézier with control points offset ±20–40px from each endpoint, re-drawn for every move. | Straight lines. |
| **5. Wobble like a hand** | Distortion zones every 0.05 of the move, each 15% likely, pulling the path 1–5px off the curve and back. | Perfectly smooth curves. |
| **6. Accelerate and decelerate** | A logistic sigmoid (`2/(1+e⁻ˣ) − 1`) reshapes time, so the pointer is slow, fast, then slow again. | Constant velocity from the first event. |
| **7. Press like a person** | `mousedown` → 200–300ms hold → `mouseup`. | Same-millisecond press and release. |
| **8. Stay inside the window** | Every sampled point is clamped to `innerWidth − 2` / `innerHeight − 2`, because a distorted curve can overshoot and Chromium drops out-of-bounds coordinates. | Failed or dropped moves. |

Step 3 is what makes this hold up under statistical analysis rather than only to
the eye. The measured model gives:

| Distance | Target (w×h) | Movement time |
| --- | --- | --- |
| 200px | 100×40 | ≈ 0.91s |
| 200px | 400×40 | ≈ 0.72s |
| 1000px | 100×40 | ≈ 1.21s |
| 1000px | 400×40 | ≈ 1.02s |

A long trip to a small button therefore takes longer than a short trip to a big
one, in the ratio a real user's data produced.

### The keyboard: rhythm instead of paste

`fill()` writes the value in one operation, and a `contenteditable` prompt box
receives one `insertText` with no key events at all. `HumanKeyboard` types one
character at a time and pauses after each, with the pause drawn from
`mimic_typing.py`'s measured distribution:

| Pause | Probability |
| --- | --- |
| 0–100ms | 37.7% |
| 100–200ms | 54.9% |
| 200–400ms | 7.4% |

That produces the uneven rhythm of real typing — bursts of fast characters with
the occasional longer pause — instead of one flat interval. The same sampler
paces the `Enter` keypress in the submit fallback.

### Behaviour that is not about the pointer

Three smaller decisions matter for the same reason:

- **No gratuitous scrolling.** An element below the fold is brought in with
  `behavior: 'smooth'` and the rect is polled until it stops moving — but only
  when it is genuinely out of view. Re-centering a visible element shifts the
  page for no reason and is itself a tell.
- **Scroll gestures, not jumps.** `page.mouse.wheel` in varying steps of
  40–340px with 40–120ms gaps, and a return-to-top that reads the real `scrollY`
  instead of unwinding a counted number of equal steps.
- **One instance per page.** The pointer position, the visual cursor and the
  tracker live in a `HumanInput` bound to a single page, so state carries
  correctly and two providers can never share a pointer.

### Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `HUMAN_INPUT` | `true` | Bézier paths, Fitts' law timing, humanised clicks. `false` restores plain Playwright clicks. |
| `HUMAN_TYPING` | `true` | Type prompts key by key. `false` uses `fill()`. |
| `HUMAN_VISUALIZE_CURSOR` | `false` | Draw a red dot where the pointer is (use with `HEADLESS=false`). |

The code is in `src/human/`: `pointer.ts` is the maths as pure functions,
`mouse.ts` the pointer, `keyboard.ts` the typing, `human-input.ts` the per-page
facade. `BrowserManager` hands out one instance per page to both providers, so a
single set of `HumanInputOptions` covers ChatGPT and Gemini.

If a humanised click fails for any reason, the call falls back to a plain
Playwright click: the path is a nicety, clicking the right element is the job.
Typing falls back to `fill()` if the field turns out to be empty afterwards.

### ⚠️ What this does **not** do

Be clear about the boundary, because the marketing version of this idea is
misleading. Human-like input fixes **one layer** of detection: the input-event
layer. That is a real improvement — it is the easiest layer to check, and plenty
of systems check nothing else — but it is not a guarantee, and no technique can
honestly promise "zero bans":

| Risk | Covered? | Why |
| --- | --- | --- |
| Input-event patterns (path, timing, rhythm) | ✅ | This is what the port above addresses. |
| Browser fingerprint (`navigator.webdriver`, CDP traces, canvas/WebGL) | 🟡 | Partly, via `playwright-extra` + `puppeteer-extra-plugin-stealth` and `--disable-blink-features=AutomationControlled`. Incomplete by nature. |
| Headless detection | 🟡 | Chromium's new headless mode is closer to headed than the old one, but still distinguishable. |
| TLS / HTTP fingerprint (JA3/JA4, header order) | ❌ | Playwright's Chromium sends its own handshake. A Chromium build is plausible, but it is not the Chrome the UA string claims. |
| IP reputation | ❌ | No proxy support. Many requests from one datacenter IP look like exactly what they are. |
| Account-level heuristics | ❌ | Daily volume, prompt cadence and generations per account are not something pointer code can disguise. |
| Platform ToS | ❌ | Automation may violate the terms regardless of how the events are formed. |

**In practice ban risk is driven far more by volume, IP and account history than
by mouse paths.** The levers that actually move it: keep request volume low, one
account per profile, do not leave the loop running unattended for hours, and
prefer a residential connection over a VPS IP. Treat the human-like input as
removing a *signal*, not as a licence to increase volume. The disclaimer at the
top of this file applies in full: **use at your own risk.**

### Seeing it work

```bash
# Watch the pointer move in a visible window
HUMAN_VISUALIZE_CURSOR=true HEADLESS=false npm run server

# Prove the pointer never leaves the viewport, that a second move starts where
# the first ended, and that the Fitts' law numbers match the measured model
npm test
```

The suite runs the real pointer code against a fake page whose `evaluate`
executes the actual page-side functions, so the path, the clamping, the cursor
tracking and the typing rhythm are all verified without a browser.

---

## 🐳 Docker Deployment

Everything needed to host the API headlessly: `Dockerfile`, `docker-compose.yml`
and `.dockerignore`. Nothing has to be installed on the host but Docker — the
image brings Node, tsx, Playwright's Chromium and every shared library Chromium
needs.

### What is in the image

| Layer | Contents |
| --- | --- |
| Base | `node:24-bookworm-slim` |
| Dependencies | `npm ci` from `package-lock.json`, **including** dev dependencies, because `tsx` is what runs the TypeScript at runtime; there is no build step |
| Browser | `npx playwright install --with-deps chromium`, kept at `/ms-playwright` so `node_modules` can be replaced without losing it |
| Source | The repository, minus everything in `.dockerignore` |
| Start | `npm run start:prod` → `tsx src/server.ts` (not the watch mode meant for development) |
| Health | `HEALTHCHECK` on `GET /health` using Node's own `fetch`, so the image needs no curl |

### Requirements

- Docker Engine 20.10+ with Compose v2 (`docker compose`, not `docker-compose`)
- Roughly 2.5GB of disk for the image
- A **Linux** host if you want to reuse an existing sign-in (see step 2)

### 1. Configure `.env`

```bash
cp .env.example .env
```

Compose reads `.env` twice: for `${...}` interpolation inside the compose file,
and as the container's environment. Editing `.env` and restarting covers every
setting except the ones the container must own:

| Variable | Container value | Why |
| --- | --- | --- |
| `HEADLESS` | `true` (set by compose) | There is no display in a container. |
| `USE_REAL_CHROME` | `false` (set by image and compose) | Playwright's Chromium is not Google Chrome, and `channel: 'chrome'` needs the latter. |
| `OUTPUT_DIR` | `/app/outputs` (set by compose) | So generated files land in the mounted directory. |
| `PORT` | from `.env` | Used on both sides of the port mapping, so container and host agree. |
| `STORAGE_MODE` | from `.env` | `local`, `bunny` or `both`. |
| `SERVER_BASE_URL` | from `.env` | Must be the URL clients actually use, or `/outputs/...` links point at `localhost`. |
| `HUMAN_INPUT`, `HUMAN_TYPING` | from `.env` | Defaults are fine; see the previous section. |
| `BUNNY_*` | from `.env` | Only needed for `STORAGE_MODE=bunny` or `both`. |

### 2. Sign in once on the host

A headless container has no display to type a password into, so the sign-in
happens on the host and the profile directory is mounted in:

```bash
npm run login:chatgpt     # writes ./chatgpt-profile
npm run login:gemini      # writes ./gemini-profile
```

This only works when the host is Linux. Chromium encrypts cookie values with a
key the operating system holds, and on Windows that key is wrapped with DPAPI
and tied to the Windows account that wrote it, so a container cannot unwrap it
and reads every cookie as absent: the browser starts, looks healthy, and behaves
as though it were logged out. Sign in normally on a Linux host, close the window
the usual way afterwards, then mount the directory.

### 3. Start it

```bash
docker compose up -d --build
docker compose logs -f imagebridge
curl http://localhost:3001/health
```

| Mount | Why |
| --- | --- |
| `./chatgpt-profile` → `/app/chatgpt-profile` | The ChatGPT sign-in. |
| `./gemini-profile` → `/app/gemini-profile` | The Gemini sign-in. |
| `./outputs` → `/app/outputs` | Generated images, served as `/outputs/<file>`. |

Generated images live in a host directory rather than inside the container, so
`STORAGE_MODE=local` keeps working across rebuilds and the files can be served by
a reverse proxy.

```bash
# Rebuild after changing the source
docker compose up -d --build

# One request against the running container
curl -X POST http://localhost:3001/api/generate/gemini \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a red fox in snow","storageMode":"local"}'
```

`docker compose down` stops it. The profile directories are on the host, so the
sign-in survives.

Chromium needs more than the default 64MB of shared memory, which is why the
compose file sets `shm_size: 1gb`; without it the browser can crash partway
through a page. The container runs as root because it writes to mounted profile
directories and outputs owned by the host user.

---
## 🖥️ Server / VPS (Linux / Ubuntu) Deployment Guide

To deploy this backend on a headless Linux VPS (e.g. Ubuntu 22.04 / 24.04):

### 1. Install System Packages & Chromium Dependencies
```bash
sudo apt-get update
sudo apt-get install -y \
  curl \
  git \
  xvfb \
  libgbm-dev \
  libnss3 \
  libasound2 \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libx11-xcb1 \
  libxss1 \
  libgconf-2-4
```

### 2. Clone Repository & Install Node Dependencies
```bash
git clone <YOUR_REPO_URL>
cd chatgpt/backend
npm install
npx playwright install chromium
npx playwright install-deps
```

### 3. Transfer Session Profile to Server
Since headless servers do not have a display to log in visually, transfer your authenticated local browser profile:

```bash
# From your local machine:
scp -r ./chatgpt-profile user@your-server-ip:/path/to/chatgpt/backend/
```

*(Alternatively, run `xvfb-run npm run login:chatgpt` with X11 forwarding or VNC).*

### 4. Configure Production `.env`
```bash
cp .env.example .env
nano .env
```
Set:
```env
PORT=3001
HEADLESS=true
STORAGE_MODE=both
SERVER_BASE_URL=https://api.yourdomain.com
```

### 5. Run with PM2 (24/7 Background Process)
```bash
# Install PM2 globally
sudo npm install -g pm2

# Start server daemon
pm2 start src/server.ts --name "ai-image-api" --interpreter ./node_modules/.bin/tsx

# Save PM2 process list
pm2 save
pm2 startup
```

---

## 📡 API Reference & Request Examples

### 1. Health Check
- **Route**: `GET /health`
- **Response**:
```json
{
  "status": "ok",
  "service": "AI Image Generation Express API Server",
  "port": 3001,
  "defaultProvider": "chatgpt",
  "storageMode": "both",
  "supportedProviders": ["chatgpt", "gemini"]
}
```

---

### 2. ChatGPT Image Generation
- **Route**: `POST /api/generate/chatgpt`
- **Body Parameters**:
  - `prompt` *(string, required)*: The text description of the image to generate.
  - `image` *(string, optional)*: Local image file path or URL for image-to-image reference.
  - `storageMode` *(string, optional)*: Override storage mode (`local`, `bunny`, or `both`).

#### cURL Example:
```bash
curl -X POST http://localhost:3001/api/generate/chatgpt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A futuristic electric hypercar in a neon-lit showroom, 8k render",
    "storageMode": "both"
  }'
```

#### JavaScript (`fetch`) Example:
```javascript
const response = await fetch('http://localhost:3001/api/generate/chatgpt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'A futuristic electric hypercar in a neon-lit showroom',
  }),
});

const data = await response.json();
console.log('Primary URL:', data.url);
console.log('Bunny CDN URL:', data.cdnUrl);
console.log('Local Server URL:', data.localUrl);
```

#### Python (`requests`) Example:
```python
import requests

payload = {
    "prompt": "A modern minimalist living room with warm sunset lighting",
    "storageMode": "both"
}
response = requests.post("http://localhost:3001/api/generate/chatgpt", json=payload)
data = response.json()
print("Generated Image URL:", data.get("url"))
```

#### Sample Response:
```json
{
  "success": true,
  "jobId": "gen_1723901234567_abc12",
  "provider": "chatgpt",
  "url": "https://my-image-app.b-cdn.net/image-generation/gen_1723901234567_abc12.png",
  "cdnUrl": "https://my-image-app.b-cdn.net/image-generation/gen_1723901234567_abc12.png",
  "localUrl": "http://localhost:3001/outputs/image-generation/gen_1723901234567_abc12.png",
  "localPath": "/path/to/outputs/image-generation/gen_1723901234567_abc12.png"
}
```

---

### 3. Gemini Image Generation
- **Route**: `POST /api/generate/gemini`
- **Body Parameters**:
  - `prompt` *(string, required)*: Text prompt.
  - `image` *(string, optional)*: Image reference path or URL.

```bash
curl -X POST http://localhost:3001/api/generate/gemini \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful scenic view of Mount Fuji during cherry blossom season, ultra photorealistic"
  }'
```

---

### 4. Generic Generation Endpoint
- **Route**: `POST /api/generate`
- **Body**: `{ "prompt": "...", "provider": "chatgpt" | "gemini", "image": "..." }`

---

## 🔒 Security & Git Protection

The repository includes a comprehensive `.gitignore` ensuring:
- 🚫 **No Browser Profiles**: `chatgpt-profile/` and `gemini-profile/` containing login cookies are never tracked or pushed to Git.
- 🚫 **No Secret Credentials**: `.env` and private key files are strictly excluded.
- 🚫 **No Generated Images**: Local `outputs/` and `tmp/` folders are ignored.

Before pushing to GitHub, verify with:
```bash
git status -u
```
You will see only clean engine source code, templates (`.env.example`), and documentation.

---

## 📄 License
MIT License.
