// Claude chat with Jira tool use via Anthropic API + mcp-atlassian.
const Anthropic = require("@anthropic-ai/sdk");
const jira = require("./jira-client");

// Lazy client -- always uses current process.env.ANTHROPIC_API_KEY
function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SYSTEM = [
  "Ban la Tom The Lizard, tro ly ca nhan cua Brian, PM tai VNG Games.",
  "Jira projects: NP (Level Up), PLH (Player Hub), VGA (VNGGames Account), VGR (VNGGames Club).",
  "Tra loi bang tieng Viet. Ngan gon, thuc te, dung chat style.",
  "Khi can truy van Jira, dung cac tool co san.",
  "Gioi han tra loi duoi 1800 ky tu vi day la Zalo chat.",
].join(" ");

const MAX_TURNS = 8;

let jiraReady = false;

async function ensureJira() {
  if (jiraReady) return;
  try {
    await jira.connect();
    jiraReady = true;
  } catch (e) {
    console.error("[claude-chat] Jira connect failed:", e.message);
  }
}

function buildTools() {
  if (!jiraReady) return [];
  return jira.getTools().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

async function chat(userMessage) {
  await ensureJira();

  const tools = buildTools();
  const messages = [{ role: "user", content: userMessage }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const params = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM,
      messages,
    };
    if (tools.length > 0) params.tools = tools;

    const response = await getClient().messages.create(params);

    if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return text || "(Khong co phan hoi)";
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        try {
          const result = await jira.callTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result.slice(0, 50000),
          });
        } catch (e) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${e.message}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    break;
  }

  return "(Het luot xu ly, thu lai voi cau hoi cu the hon)";
}

module.exports = { chat, ensureJira };
