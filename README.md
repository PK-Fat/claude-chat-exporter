# AIchat2MD

Shoutouts to [agarwalvishal](https://github.com/agarwalvishal). This project is forked from his [claude-chat-exporter](https://github.com/agarwalvishal/claude-chat-exporter) (MIT) which has been a godsend for my notes.

One click, no menus: export the conversation you're viewing — **Claude, ChatGPT, Gemini, or DeepSeek** — straight to a clean Markdown file, built for dropping into an **Obsidian** vault or a **RAG** pipeline.

> Sections marked 🟢 are substantially the original project's writing/design, still accurate here. Unmarked sections are new for AIchat2MD.

## Install

Get it from [addons.mozilla.org](#) *(add your AMO listing link here)*, or grab the signed `.xpi` from this repo's [Releases](../../releases).

## Features

- **One-click export** — toolbar button or sidebar panel (your choice, in settings), no menus to navigate
- **Four platforms** — Claude, ChatGPT, Gemini, and DeepSeek, auto-detected from whatever tab you're on
- 🟢 **Perfect Markdown fidelity (Claude)** — reads Claude's own source markdown from its API — no HTML parsing, no conversion
- 🟢 **Complete element support (Claude)** — tables, math, code, lists, artifacts, created files, charts, and attachments, all in place and in order
- 🟢 **Complete & in order** — every message on the current branch, correctly ordered, even in long conversations that only partly render on screen
- **Obsidian-ready frontmatter** — `title`, `agent`, `exported` date, and `source` in every file's YAML header
- 🟢 **Private by design** — no servers of its own; runs entirely in your browser and only ever calls the AI service's own backend, over your existing session

## How it works

Not every platform exposes the same thing, so this uses whichever approach each one actually allows:

### 🟢 Claude

1. **Fetch** — calls Claude's internal API for the current conversation (`/api/organizations/{orgId}/chat_conversations/{conversationId}`), authenticated by your existing session cookie
2. **Order** — reconstructs the conversation's current branch by walking the message tree from the current leaf up its parent chain, so a regenerated response exports exactly what's on screen
3. **Extract** — walks each message's content blocks in order: text blocks (Claude's original source markdown) plus artifacts, created files, and widgets, rendered in position
4. **Output** — writes a single markdown file: YAML frontmatter followed by one `#`-level header per turn

> **Branches / regenerated responses:** the export follows whichever branch is currently on screen — Claude's *active leaf* — not necessarily the newest one. Switch branches in Claude first (the `‹ ›` arrows on a regenerated message) if you want a different one.

### ChatGPT

Same approach, adapted to ChatGPT's own API:

1. **Session** — reads an access token from ChatGPT's `/api/auth/session` endpoint
2. **Fetch** — calls `/backend-api/conversation/{id}` with that token, which returns the full conversation as a node graph rather than a flat list
3. **Order** — walks from `current_node` back to the root via each node's `parent` link, then reverses — same branch-following logic as the Claude side
4. **Output** — same frontmatter + per-turn header format

### Gemini

Gemini doesn't expose a usable conversation API (its internal RPCs are protobuf-based and not practical to read directly), so this reads the rendered page instead:

1. **Locate** — finds each `<conversation-turn>` element and, within it, the `<user-query>`/`<model-response>` pair
2. **Force full render** — a quick scroll to the top and back down first, since long conversations can lazy-unmount turns that have scrolled out of view
3. **Convert** — walks each response's HTML into Markdown by hand (headings, lists, tables, code blocks — including Gemini's custom `<code-block>` element, which can render inside an open shadow root), filtering out the "what would you like to do next" suggestion chips Gemini appends after each answer
4. **Output** — same frontmatter format as Claude/ChatGPT

Being DOM-based rather than API-based, this one is more exposed to breaking if Google changes the page's structure than the Claude/ChatGPT side is.

### DeepSeek

DeepSeek does have an internal API, but its exact shape isn't publicly documented, so this tries two approaches in order:

1. **API attempt** — calls DeepSeek's internal `history_messages` endpoint with your session token; if the response doesn't match the expected shape, this fails gracefully rather than exporting garbage
2. **DOM fallback** — if the API attempt fails, falls back to reading the rendered page: finds message-like elements, strips DeepSeek's own UI chrome (buttons, icons — anything with a `ds-`-prefixed class), and assumes strict user/assistant alternation starting with the user, since that holds for any non-group chat

### 🟢 Why not always just read the page?

```
❌ Driving the page (DOM + copy buttons):
- Only sees the messages currently rendered → long chats export partially
- Pairs turns by index → a regenerated branch can misalign them
- Reaches only what has a copy button → no artifacts, files or attachments
- Couples to CSS selectors that change constantly → a maintenance nightmare

✅ Reading the service's own API, where one exists (Claude, ChatGPT, DeepSeek):
- Complete conversation, always, in the order it appears on screen
- Original source markdown → perfect fidelity, zero conversion
- A stable data contract instead of brittle selectors
```

Gemini has no such API to read, so it's stuck with the DOM approach above — same tradeoffs as any scraper, just done as carefully as possible.

## File output

- **Filename**: `[Chat title].md` — no date suffix as of v2.0.0 (dropped once exports started coming from four different platforms instead of two; re-exporting will overwrite a file of the same name)
- **Frontmatter**: `title`, `agent` (Claude/ChatGPT/Gemini/DeepSeek), `exported`, `source`, and `model` when available
- 🟢 **Content**: complete conversation, in order, with per-message timestamps where the platform provides them
- 🟢 **Encoding**: UTF-8 with standard line endings

```yaml
---
title: "Sorting algorithm comparison"
agent: "Claude"
exported: "2026-09-12"
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

**ChatGPT** currently handles plain text and code-interpreter output. **Gemini** handles headings, lists, tables, links, and code blocks via its own HTML-to-Markdown conversion. **DeepSeek** handles plain message text on both its API and DOM-fallback paths. None of the four inline image generations or other rich attachment types yet — see Roadmap.

## Settings

Toolbar or sidebar — pick one in the extension's options page (`about:addons` → AIchat2MD → Preferences). Toolbar mode exports the instant you click the icon; sidebar mode opens a small panel with its own Export button.

## 🟢 Privacy & security

- No backend of its own — this tool runs no servers; your conversations are never sent to us or any other party
- All processing happens locally, in your browser
- The only network calls are to the AI service's own API, over your existing session — the same data the web app already loads for you
- Nothing is retained — messages are transformed and downloaded immediately

## Limitations

- 🟢 Requires the account you're currently signed into on each platform
- 🟢 Relies on each service's internal, undocumented API (Claude, ChatGPT, DeepSeek) or rendered page structure (Gemini) — a response-shape or UI change would require an update
- 🟢 **Claude**: other tool calls (web search, bash, file view/edit) and internal thinking blocks aren't exported by design
- **ChatGPT / Gemini / DeepSeek**: images, generated media, and other rich content types aren't inlined yet
- **Gemini and DeepSeek's DOM-scraping paths** are inherently more fragile than Claude/ChatGPT's API-based ones — a Google or DeepSeek UI update is more likely to break these than a Claude/OpenAI one is to break theirs
- All four only export the currently-selected branch of a conversation, not every regenerated alternative

## Roadmap

**Done:**
- v1.0 — Claude and ChatGPT export via each service's own API
- v2.0.0 — added Gemini and DeepSeek, toolbar/sidebar toggle, dropped the filename date suffix, moved to listed AMO distribution

**Next up:**
- Perplexity support — attempted for v2.0.0 (it has its own native "Export as Markdown" feature, reachable via its `···` menu) but pulled before release; the DOM interaction was tricky enough to need more testing than this cycle had room for
- Meta AI, Grok, and Copilot — rounding out support for all of the "Big 8" AI chat platforms
- Images and attachments in exports — planned for a future major version, once text-only export across all platforms is solid

## Contributing

Issues and PRs welcome — this is a small personal project, so response time varies.

## License

MIT — see [`LICENSE`](LICENSE). Original work Copyright (c) agarwalvishal; this fork's additions Copyright (c) PK.

## Disclaimer

This tool is not officially associated with Anthropic, OpenAI, Google, DeepSeek, Claude, ChatGPT, or Gemini. It's a community-created tool to enhance the user experience. Use it responsibly and in accordance with each service's terms of service.
