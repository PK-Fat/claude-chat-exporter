// AIchat2MD — background script.
//
// Two ways to trigger an export, both funneling into the same runExport():
//   1. Toolbar mode: clicking the toolbar icon exports immediately.
//   2. Sidebar mode: clicking the toolbar icon opens the sidebar panel,
//      which has its own "Export" button that sends a message here.
// Which mode is active is a single value in browser.storage.local, set from
// the options page (options.html/options.js).

const PLATFORMS = [
  { label: "Claude", test: (url) => /^https:\/\/claude\.ai\//.test(url), func: exportClaude },
  { label: "ChatGPT", test: (url) => /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url), func: exportChatGPT },
];

const DEFAULT_MODE = "toolbar"; // "toolbar" | "sidebar"

browser.action.onClicked.addListener(async (tab) => {
  const { uiMode = DEFAULT_MODE } = await browser.storage.local.get("uiMode");
  if (uiMode === "sidebar") {
    browser.sidebarAction.open();
    return;
  }
  await runExport(tab);
});

// The sidebar panel can't call scripting.executeScript on an arbitrary tab
// as conveniently as the background script can, so it just asks us to do it.
browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "export") return;
  return (async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { error: "Couldn't find the active tab." };
    return runExport(tab);
  })();
});

async function runExport(tab) {
  try {
    const url = tab.url || "";
    const platform = PLATFORMS.find((p) => p.test(url));
    if (!platform) {
      notify("AIchat2MD", "Open a Claude or ChatGPT conversation first.");
      return { error: "Not a supported conversation page." };
    }

    const [injected] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: platform.func,
    });

    const value = injected && injected.result;
    if (!value) throw new Error("Got no result back from the page.");
    if (value.error) throw new Error(value.error);

    const filename = buildFilename(value.title);
    const blob = new Blob([value.markdown], { type: "text/markdown" });
    const blobUrl = URL.createObjectURL(blob);

    const downloadId = await browser.downloads.download({
      url: blobUrl,
      filename,
      saveAs: true,
    });

    const cleanup = () => URL.revokeObjectURL(blobUrl);
    const listener = (delta) => {
      if (delta.id === downloadId && (delta.state?.current === "complete" || delta.state?.current === "interrupted")) {
        browser.downloads.onChanged.removeListener(listener);
        cleanup();
      }
    };
    browser.downloads.onChanged.addListener(listener);
    setTimeout(cleanup, 60000);

    return { ok: true, filename };
  } catch (err) {
    console.error("[AIchat2MD]", err);
    notify("Export failed", err.message || String(err));
    return { error: err.message || String(err) };
  }
}

// Filename no longer carries the agent name — that now lives in the
// frontmatter header instead, so this is just "[Title] (MM.DD.YY).md".
function buildFilename(rawTitle) {
  const title = (rawTitle || "Untitled").trim() || "Untitled";
  const safeTitle = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  return `${safeTitle} (${mm}.${dd}.${yy}).md`;
}

function notify(title, message) {
  browser.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-96.png",
    title,
    message,
  });
}

// ---------------------------------------------------------------------------
// Exporter functions below are injected into the page via
// scripting.executeScript, so each one must be fully self-contained: no
// references to anything outside its own body. Each returns
// { title, markdown } on success, or { error } on failure — never throws,
// since a thrown error from an injected function surfaces as an opaque
// "Error in invocation" on the caller side.
// ---------------------------------------------------------------------------

// Adapted from agarwalvishal/claude-chat-exporter (MIT License) — reads the
// conversation straight from claude.ai's own internal API (same endpoint the
// app uses), which returns every message's source markdown in order, rather
// than scraping the rendered DOM.
async function exportClaude() {
  try {
    const conversationId = window.location.pathname.split("/").pop();
    const orgId = document.cookie.match(/lastActiveOrg=([^;]+)/)?.[1];
    if (!conversationId || conversationId.length < 20 || !conversationId.includes("-")) {
      return { error: "Open a specific Claude conversation first." };
    }
    if (!orgId) {
      return { error: "Couldn't read your Claude session — are you signed in?" };
    }

    const apiUrl = `/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;
    const res = await fetch(apiUrl, { credentials: "include", headers: { "Content-Type": "application/json" } });
    if (!res.ok) return { error: `Claude API request failed (HTTP ${res.status}).` };
    const data = await res.json();

    const all = data?.chat_messages || [];
    if (!all.length) return { error: "No messages found in this conversation." };
    const byUuid = new Map(all.map((m) => [m.uuid, m]));

    // Follow the currently-selected branch from the leaf back to the root,
    // then reverse — this exports exactly what's on screen even after a
    // regenerated response.
    let ordered = null;
    const leaf = data.current_leaf_message_uuid;
    if (leaf && byUuid.has(leaf)) {
      const path = [];
      const seen = new Set();
      let cur = byUuid.get(leaf);
      while (cur && !seen.has(cur.uuid)) {
        seen.add(cur.uuid);
        path.push(cur);
        cur = cur.parent_message_uuid ? byUuid.get(cur.parent_message_uuid) : null;
      }
      if (path.length) ordered = path.reverse();
    }
    if (!ordered) ordered = [...all].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    // Reconstruct each artifact's final content (create/rewrite carry full
    // content; update carries an old_str -> new_str diff) so it renders once.
    const artifacts = new Map();
    for (const m of ordered) {
      for (const block of m.content || []) {
        if (block.type !== "tool_use" || block.name !== "artifacts") continue;
        const input = block.input || {};
        const id = input.id || "__artifact__";
        let a = artifacts.get(id);
        if (!a) { a = { content: "" }; artifacts.set(id, a); }
        if (input.command === "update") {
          if (typeof input.old_str === "string" && typeof input.new_str === "string" && a.content.includes(input.old_str)) {
            a.content = a.content.replace(input.old_str, () => input.new_str);
          }
        } else if (typeof input.content === "string") {
          a.content = input.content;
        }
        if (input.title) a.title = input.title;
        if (input.language) a.language = input.language;
        a.lastVersionUuid = input.version_uuid;
      }
    }

    const fence = (src) => "`".repeat(Math.max(3, ...((src.match(/`+/g) || []).map((s) => s.length + 1))));
    const renderToolUse = (block) => {
      const input = block.input || {};
      if (block.name === "artifacts") {
        const a = artifacts.get(input.id || "__artifact__");
        if (!a || input.version_uuid !== a.lastVersionUuid || !a.content) return "";
        const f = fence(a.content);
        return `**Artifact: ${a.title || "untitled"}**\n\n${f}${a.language || ""}\n${a.content}\n${f}`;
      }
      if (block.name === "create_file" && typeof input.file_text === "string" && input.file_text) {
        const file = String(input.path || "file").split("/").pop();
        const f = fence(input.file_text);
        return `**File: ${file}**\n\n${f}\n${input.file_text}\n${f}`;
      }
      return "";
    };

    const formatTs = (iso) => {
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    };

    const yamlStr = (v) => '"' + String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

    const title = data?.name?.trim() && data.name.trim() !== "New conversation" ? data.name.trim() : "Claude conversation";
    let markdown = [
      "---",
      `title: ${yamlStr(title)}`,
      `agent: "Claude"`,
      `exported: ${new Date().toISOString().slice(0, 10)}`,
      `source: ${yamlStr(window.location.href)}`,
    ];
    if (data?.model) markdown.push(`model: ${yamlStr(data.model)}`);
    markdown.push("---", "");
    let body = markdown.join("\n") + "\n";
    let count = 0;

    for (const m of ordered) {
      const parts = [];
      for (const block of m.content || []) {
        if (block.type === "text" && typeof block.text === "string") parts.push(block.text.trim());
        else if (block.type === "tool_use") parts.push(renderToolUse(block));
      }
      const text = parts.filter(Boolean).join("\n\n").trim();
      if (!text) continue;
      const who = m.sender === "human" ? "Human" : "Claude";
      const ts = formatTs(m.created_at);
      body += `${ts ? `# ${who} — ${ts}` : `# ${who}`}\n\n${text}\n\n`;
      count++;
    }

    if (!count) return { error: "No exportable content found in this conversation." };
    return { title, markdown: body };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

// Reads the conversation from ChatGPT's internal backend API: fetches a
// session access token, then the conversation's node graph, and walks the
// current branch from `current_node` back to the root.
async function exportChatGPT() {
  try {
    const conversationId = window.location.pathname.split("/").filter(Boolean).pop();
    if (!conversationId || conversationId.length < 20) {
      return { error: "Open a specific ChatGPT conversation first." };
    }

    const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
    if (!sessionRes.ok) return { error: `Couldn't read your ChatGPT session (HTTP ${sessionRes.status}) — are you signed in?` };
    const session = await sessionRes.json();
    const token = session?.accessToken;
    if (!token) return { error: "Couldn't get a ChatGPT access token — are you signed in?" };

    const convoRes = await fetch(`/backend-api/conversation/${conversationId}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!convoRes.ok) return { error: `ChatGPT API request failed (HTTP ${convoRes.status}).` };
    const data = await convoRes.json();

    const mapping = data?.mapping;
    if (!mapping) return { error: "Unexpected ChatGPT API response — no conversation data." };

    // Walk from the current leaf node back to the root via `parent`, reverse
    // to get conversation order — same approach as the Claude exporter.
    let ordered = [];
    let nodeId = data.current_node;
    const seen = new Set();
    while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      ordered.push(mapping[nodeId]);
      nodeId = mapping[nodeId].parent;
    }
    ordered.reverse();

    const yamlStr = (v) => '"' + String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    const title = (data?.title || "").trim() || "ChatGPT conversation";
    let markdown = [
      "---",
      `title: ${yamlStr(title)}`,
      `agent: "ChatGPT"`,
      `exported: ${new Date().toISOString().slice(0, 10)}`,
      `source: ${yamlStr(window.location.href)}`,
    ];
    if (data?.model_slug) markdown.push(`model: ${yamlStr(data.model_slug)}`);
    markdown.push("---", "");
    let body = markdown.join("\n") + "\n";
    let count = 0;

    for (const node of ordered) {
      const msg = node.message;
      if (!msg) continue;
      const role = msg.author?.role;
      if (role !== "user" && role !== "assistant") continue; // skip system/tool nodes
      const contentType = msg.content?.content_type;
      let text = "";
      if (contentType === "text" && Array.isArray(msg.content.parts)) {
        text = msg.content.parts.filter((p) => typeof p === "string").join("\n\n").trim();
      } else if (contentType === "code" && typeof msg.content.text === "string") {
        text = "```\n" + msg.content.text + "\n```";
      }
      if (!text) continue;

      const who = role === "user" ? "Human" : "ChatGPT";
      const created = msg.create_time ? new Date(msg.create_time * 1000) : null;
      const ts = created && !isNaN(created.getTime())
        ? created.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
        : null;
      body += `${ts ? `# ${who} — ${ts}` : `# ${who}`}\n\n${text}\n\n`;
      count++;
    }

    if (!count) return { error: "No exportable content found in this conversation." };
    return { title, markdown: body };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}
