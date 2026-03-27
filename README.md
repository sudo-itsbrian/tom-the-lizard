# Tom The Lizard

AI-powered personal assistant on Zalo with Jira/Confluence integration, live traffic updates, vocabulary builder, and a web dashboard for configuration.

## Features

- **Two-way Zalo chat** -- send messages, get AI responses powered by Claude
- **Jira & Confluence** -- query issues, search pages, update tasks via natural language
- **Traffic updates** -- live commute info via TomTom API (`/work`, `/home`)
- **Vocabulary builder** -- daily English word with definitions and examples (`/word`)
- **Scheduled tasks** -- describe what you want in natural language, AI generates the script
- **Web dashboard** -- configure integrations, manage schedules, view message logs
- **Onboarding wizard** -- guided first-time setup, no manual `.env` editing

## Architecture

```
tom-the-lizard/
|
|-- index.js                  # Bot entry point (Zalo polling, command routing)
|-- send-zalo.js              # Standalone Zalo message sender (CLI)
|
|-- src/
|   |-- bot-state.js          # Shared state singleton (messages, config, status)
|   |-- claude-chat.js        # Claude API + Jira MCP tool-use loop
|   |-- config-store.js       # Dual-mode config (local .env vs production config.json)
|   |-- data-dir.js           # Data directory resolution (DATA_DIR env or ./data)
|   |-- jira-client.js        # mcp-atlassian stdio client (Jira + Confluence)
|   |-- scheduler.js          # Cron-based task runner (persists to tasks.json)
|   |-- script-generator.js   # AI script generation with dry-run validation
|   |-- traffic.js            # TomTom traffic check (module + CLI with --send)
|
|-- dashboard/
|   |-- server.js             # Express API (status, config, secrets, places, geocode)
|   |-- public/
|       |-- index.html        # SPA with onboarding wizard
|       |-- style.css         # Tom The Lizard theme (green/yellow, light+dark)
|       |-- app.js            # Client-side logic (navigation, forms, SSE)
|       |-- tom-avatar.png    # Bot avatar
|
|-- data/                     # Runtime data (mounted volume in Docker)
|   |-- .env                  # Secrets (canonical location)
|   |-- places.json           # Home, work, and custom locations
|   |-- tasks.json            # Scheduled task definitions
|   |-- word-config.json      # Vocabulary category settings
|   |-- word-history.json     # Recent /word history (avoids repeats)
|   |-- scripts/              # AI-generated task scripts
```

## How It Works

```
User (Zalo)                   Tom (Node.js)                    Services
    |                              |                              |
    |-- /work ----------------->   |-- TomTom Routing API ------> |
    |                              |<-- traffic data --------------|
    |<-- formatted report ------   |                              |
    |                              |                              |
    |-- "list PLH issues" ----->   |-- Claude API (tool use) ---> |
    |                              |-- mcp-atlassian (Jira) ----> |
    |                              |<-- issue list ---------------|
    |<-- Vietnamese response ---   |                              |
    |                              |                              |
    |-- /word ----------------->   |-- Claude API (vocab gen) --> |
    |<-- word + definition -----   |                              |
```

### Dashboard

The web dashboard runs on port 3100 alongside the bot process:

- **Overview** -- bot status, uptime, memory, recent messages (SSE live)
- **Integrations** -- Atlassian (Jira+Confluence), TomTom (places search), Vocabulary
- **Scheduler** -- natural language task creation with AI script generation
- **Chat Config** -- Claude model, system prompt, message limits
- **Messages** -- conversation log with filtering
- **Security** -- write-only credential management

### Scheduled Tasks

Users describe tasks in plain English. Claude generates a Node.js script that:
1. Reads credentials from `process.env`
2. Calls external APIs (TomTom, fetch, etc.)
3. Sends results via Zalo
4. Exits with proper status codes

Scripts are validated before saving:
1. Syntax check (`node --check`)
2. Dry-run execution (Zalo sends disabled, real API keys passed to catch 404s, bad endpoints, etc.)
3. If either fails, the error is fed back to Claude for automatic retry (up to 2 retries)

## Quick Start

```bash
# Clone
git clone https://github.com/sudo-itsbrian/tom-the-lizard.git
cd tom-the-lizard

# Install dependencies
npm install

# Install uv (required for Jira/Confluence integration)
# macOS
brew install uv
# or Linux/macOS (universal)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Start (opens onboarding wizard at localhost:3100)
npm start
```

> **Note**: `uv`/`uvx` is a Python package runner used to launch `mcp-atlassian` (the Jira/Confluence MCP server). If you skip this, everything works except Jira/Confluence queries. In Docker, `uv` is pre-installed.

The onboarding wizard guides you through:
1. Zalo Bot Token
2. Anthropic API Key
3. Home/Work locations (optional)
4. Atlassian credentials (optional)

After setup, send any message to Tom on Zalo. Your Chat ID is captured automatically.

## Inline Commands

| Command | Description |
|---------|-------------|
| `/start` | Show available commands |
| `/ping` | Health check |
| `/work` | Traffic from home to work |
| `/home` | Traffic from work to home |
| `/word` | Random English vocabulary word |

Any other message is processed by Claude with Jira/Confluence tool access.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZALO_BOT_TOKEN` | Yes | Zalo Bot API token |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `MY_CHAT_ID` | Auto | Captured on first message |
| `TOMTOM_API_KEY` | Optional | For traffic features |
| `JIRA_EMAIL` | Optional | Atlassian account email |
| `JIRA_API_TOKEN` | Optional | Atlassian API token |
| `JIRA_BASE_URL` | Optional | e.g. https://your-org.atlassian.net |

## Deployment (Docker / Dokploy)

```bash
docker build -t tom-the-lizard .
docker run -p 3100:3100 \
  -e ZALO_BOT_TOKEN=... \
  -e ANTHROPIC_API_KEY=... \
  -v tom-data:/app/data \
  tom-the-lizard
```

The app runs in two modes:

| | Local | Production (`NODE_ENV=production`) |
|---|---|---|
| **Secrets** | Stored in `data/.env`, editable via dashboard | From `process.env` (Dokploy), dashboard shows locked |
| **Config** (chat ID, Jira email/URL) | `data/.env` | `data/config.json` (editable via dashboard, persists across deploys) |
| **Data files** | `data/` directory | `/app/data` volume mount |
| **Token change detection** | Dashboard clears chat ID | SHA-256 hash comparison on startup auto-clears chat ID |

Mount a persistent volume at `/app/data` to retain places, tasks, word config, generated scripts, and non-secret config across deploys.

## Tech Stack

- **Runtime**: Node.js
- **Bot**: node-zalo-bot (polling)
- **AI**: Anthropic Claude API (@anthropic-ai/sdk)
- **Jira/Confluence**: mcp-atlassian via MCP stdio
- **Traffic**: TomTom Routing + Search API
- **Geocoding**: TomTom + Nominatim (OpenStreetMap) fallback
- **Scheduler**: node-cron
- **Dashboard**: Express + vanilla HTML/CSS/JS + SSE
- **Config**: dotenv + JSON files

## License

MIT
