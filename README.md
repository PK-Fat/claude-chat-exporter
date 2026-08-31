2q1# AIchat2MD

Shoutouts to [agarwalvishal](https://github.com/agarwalvishal). This project is forked from his [claude-chat-exporter](https://github.com/agarwalvishal/claude-chat-exporter) (MIT) which has been a godsend for my notes.

One click, no menus: export the Claude or ChatGPT conversation you're viewing straight to a clean Markdown file, built for dropping into an **Obsidian** vault or a **RAG** pipeline.
 — sections below marked 🟢 are that original project's work, still accurate for how the Claude side of this extension works. Everything else was added for this fork.


> Sections marked 🟢 are substantially the original project's writing/design, still accurate here. Unmarked sections are new for AIchat2MD.

## Install

1. Download the latest release, or clone this repo and run `web-ext build`
2. Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `manifest.json`
3. Open a Claude or ChatGPT conversation, click the toolbar icon (or the sidebar panel, if you've switched modes in **Settings**) — a native Save As dialog pops up with your `.md` file ready to go

## Features

- **One-click export** — toolbar button or sidebar panel (your choice, in settings), no menus to navigate
- **Claude and ChatGPT** — both read straight from the service's own internal API, not the rendered page
- 🟢 **Perfect Markdown fidelity (Claude)** — reads Claude's own source markdown from its API — no HTML parsing, no conversion
- 🟢 **Complete element support (Claude)** — tables, math, code, lists, artifacts, created files, charts, and attachments, all in place and in order
- 🟢 **Complete & in order** — every message on the current branch, correctly ordered, even in long conversations that only partly render on screen
- **Obsidian-ready frontmatter** — `title`, `agent`, `exported` date, and `source` in every file's YAML header
- 🟢 **Private by design** — no servers of its own; runs entirely in your browser and only ever calls the AI service's own backend, over your existing session

## How it works

### 🟢 Claude

1. **Fetch** — calls Claude's internal API for the current conversation (`/api/organizations/{orgId}/chat_conversations/{conversationId}`), authenticated by your existing session cookie
2. **Order** — reconstructs the conversation's current branch by walking the message tree from the current leaf up its parent chain, so a regenerated response exports exactly what's on screen
3. **Extract** — walks each message's content blocks in order: text blocks (Claude's original source markdown) plus artifacts, created files, and widgets, rendered in position
4. **Output** — writes a single markdown file: YAML frontmatter followed by one `#`-level header per turn

> **Branches / regenerated responses:** the export follows whichever branch is currently on screen — Claude's *active leaf* — not necessarily the newest one. Switch branches in Claude first (the `‹ ›` arrows on a regenerated message) if you want a different one.

### ChatGPT

Same approach, adapted to ChatGPT's own API:
-
1. **Session** — reads an access token from ChatGPT's `/api/auth/session` endpoint
2. **Fetch** — calls `/backend-api/conversation/{id}` with that token, which returns the full conversation as a node graph rather than a flat list
3. **Order** — walks from `current_node` back to the root via each node's `parent` link, then reverses — same branch-following logic as the Claude side
4. **Output** — same frontmatter + per-turn header format

### 🟢 Why read the API instead of the page?

```
❌ Driving the page (DOM + copy buttons):
- Only sees the messages currently rendered → long chats export partially
- Pairs turns by index → a regenerated branch can misalign them
- Reaches only what has a copy button → no artifacts, files or attachments
- Couples to CSS selectors that change constantly → a maintenance nightmare

✅ Reading the service's own API:
- Complete conversation, always, in the order it appears on screen
- Original source markdown → perfect fidelity, zero conversion
- A stable data contract instead of brittle selectors
```

## File output

- **Filename**: `[Chat title] (MM.DD.YY).md` — date is when you exported, not when the chat happened, so re-exporting later doesn't overwrite the original
- **Frontmatter**: `title`, `agent` (Claude/ChatGPT), `exported`, `source`, and `model` when available
- 🟢 **Content**: complete conversation, in order, with per-message timestamps
- 🟢 **Encoding**: UTF-8 with standard line endings

```yaml
---
title: "Sorting algorithm comparison"
agent: "Claude"
exported: "2026-08-30"
source: "https://claude.ai/chat/…"
model: "claude-opus-5"
---

# Human — Aug 30, 2026, 10:30 AM

Can you compare the common sorting algorithms in a table?

# Claude — Aug 30, 2026, 10:31 AM

| Algorithm  | Best       | Average    | Worst      |
| ---------- | ---------- | ---------- | ---------- |
| Merge Sort | O(n log n) | O(n log n) | O(n log n) |
```

## 🟢 Complete element support (Claude)

Because this reads Claude's source markdown directly, it automatically handles:

- Tables, math (LaTeX), code blocks with language detection, nested lists, links, formatting, blockquotes, all heading levels
- Artifacts (final version), created files, and charts/diagrams/widgets, as labelled fenced code blocks

**ChatGPT** currently handles plain text and code-interpreter output; image generations and other rich content types aren't inlined yet.

## Settings

Toolbar or sidebar — pick one in the extension's options page (`about:addons` → AIchat2MD → Preferences). Toolbar mode exports the instant you click the icon; sidebar mode opens a small panel with its own Export button.

## 🟢 Privacy & security

- No backend of its own — this tool runs no servers; your conversations are never sent to us or any other party
- All processing happens locally, in your browser
- The only network calls are to the AI service's own API, over your existing session — the same data the web app already loads for you
- Nothing is retained — messages are transformed and downloaded immediately

## Limitations

- 🟢 Requires the account you're currently signed into on claude.ai / chatgpt.com
- 🟢 Relies on each service's internal, undocumented API — a response-shape change would require an update
- 🟢 **Claude**: other tool calls (web search, bash, file view/edit) and internal thinking blocks aren't exported by design
- **ChatGPT**: images, DALL·E generations, and other rich content types aren't inlined yet
- Both only export the currently-selected branch of a conversation, not every regenerated alternative

## Contributing

Issues and PRs welcome — this is a small personal project, so response time varies.

## License

MIT — see [`LICENSE`](LICENSE). Original work Copyright (c) agarwalvishal; this fork's additions Copyright (c) PK.

The original project is under active, ongoing maintenance to keep pace with Claude's API. If this firefox extension brings you joy [sponsoring it](https://github.com/sponsors/agarwalvishal) is what funds that upkeep, independent of this fork.

## Disclaimer

This tool is not officially associated with Anthropic, OpenAI, Claude, or ChatGPT. It's a community-created tool to enhance the user experience. Use it responsibly and in accordance with each service's terms of service.
