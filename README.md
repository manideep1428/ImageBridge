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
