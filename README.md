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
|-- claude-chat.js            # Claude API + Jira MCP tool-use loop
|-- jira-client.js            # mcp-atlassian stdio client (Jira + Confluence)
|-- bot-state.js              # Shared state singleton (messages, config, status)
|-- scheduler.js              # Cron-based task runner (persists to tasks.json)
|-- script-generator.js       # AI script generation from natural language
|-- traffic-check.js          # Scheduled traffic report (reads places.json)
|-- traffic-check-inline.js   # Inline traffic for /work and /home commands
|-- send-zalo.js              # Standalone Zalo message sender
|
|-- dashboard/
|   |-- server.js             # Express API (status, config, secrets, places, geocode)
|   |-- public/
|       |-- index.html        # SPA with onboarding wizard
|       |-- style.css         # Tom The Lizard theme (green/yellow, light+dark)
|       |-- app.js            # Client-side logic (navigation, forms, SSE)
|       |-- tom-avatar.png    # Bot avatar
|
|-- scripts/                  # AI-generated task scripts
|-- places.json               # Home, work, and custom locations
|-- tasks.json                # Scheduled task definitions
|-- word-config.json           # Vocabulary category settings
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

Scripts are validated with `node --check` before saving.

## Quick Start

```bash
# Clone
git clone https://github.com/AceDungg/tom-the-lizard.git
cd tom-the-lizard

# Install dependencies
npm install

# Start (opens onboarding wizard at localhost:3100)
npm start
```

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
