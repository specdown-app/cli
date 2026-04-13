# SpecDown CLI — AI-Native Markdown CLI for Spec as Code

<p align="center">
  <img src="https://img.shields.io/npm/v/specdown-cli?color=blue" alt="npm version" />
  <img src="https://img.shields.io/node/v/specdown-cli" alt="node" />
  <img src="https://img.shields.io/npm/dm/specdown-cli" alt="downloads" />
  <img src="https://img.shields.io/badge/spec--as--code-CLI-blueviolet" alt="spec as code" />
  <img src="https://img.shields.io/badge/AI--native-CLI-orange" alt="ai-native" />
</p>

**AI-native terminal interface for [SpecDown](https://specdown.app)** — the AI-native Spec as Code platform for engineering teams.

Manage your Markdown spec docs from the terminal: read, write, push, pull, search, and sync. Built for AI-native spec-driven development workflows — works seamlessly in CI/CD pipelines, AI automation scripts, and DevOps toolchains.

> **Pair with the [Markdown MCP Server](https://github.com/specdown-app/mcp-server)** to give Claude, Cursor, and Copilot direct access to your spec documents.

---

## Why an AI-Native Markdown CLI?

Most teams store specs in Word, Notion, or Google Docs — disconnected from code. **AI-native Spec as Code** means your Markdown spec lives in Git, version-controlled, terminal-accessible, and AI-operable.

```bash
# Pull latest spec and feed to AI for review
specdown pull /api-spec.md | claude "what's missing from this spec?"

# Push updated spec from CI/CD
specdown push ./docs/openapi.md /api/openapi.md

# Search across all spec documents
specdown search "authentication flow"
```

---

## Install

```bash
npm install -g specdown-cli
```

**Requirements:** Node.js ≥ 18

---

## Quick Start

```bash
# 1. Login (opens browser — Google OAuth)
specdown login

# 2. Switch to a project
specdown use my-project-slug

# 3. List spec documents
specdown ls

# 4. Read a spec document
specdown read /api-design.md
```

---

## Commands

### Authentication

```bash
specdown login           # Sign in via browser (Google OAuth)
specdown logout          # Sign out and clear credentials
specdown whoami          # Show current user and active project
```

### Projects

```bash
specdown projects        # List all projects you have access to
specdown use <slug>      # Switch active project
```

### Browse & Read Markdown Docs

```bash
specdown ls                              # List documents in active project
specdown read <path>                     # Print document content to stdout
specdown read <path> --from 10 --to 50  # Print lines 10–50
specdown read <path> -n                 # Print with line numbers
```

### Search Across Spec Documents

```bash
specdown search "authentication flow"
specdown search "api" --files "design,api-spec"   # Restrict to specific docs
specdown search "TODO" -C 5                       # 5 lines of context around match
```

### Create Markdown Documents

```bash
specdown new "API Design"            # Create a new Markdown document
specdown new "Design" --folder       # Create a folder
specdown new "Auth" -p /design       # Create inside a folder
```

### Push & Pull — Markdown Git Sync Companion

```bash
specdown push ./local-file.md /remote/path.md    # Upload local Markdown to SpecDown
specdown pull /remote/path.md                    # Print remote doc to stdout
specdown pull /remote/path.md out.md             # Save to local file
```

### Linked Folder Sync

```bash
specdown link my-project-slug                    # Link the current folder to a SpecDown project
specdown status                                 # Show local vs remote sync summary
specdown diff                                   # Show grouped sync changes
specdown sync                                   # Apply bidirectional linked-folder sync
specdown sync --watch --yes                     # Keep the linked folder continuously synced
specdown push                                   # Push the linked folder (asks before overwrite)
specdown push --yes                             # Skip the confirmation prompt
specdown push --force                           # Apply linked-folder push even with conflicts
specdown pull                                   # Pull the linked folder (asks before overwrite)
specdown pull --force                           # Overwrite local conflicts with remote content
specdown unlink                                 # Remove the local project link
```

Linked-folder mode stores a manifest in `.specdown/project.json` and a sync state snapshot in `.specdown/sync-state.json`. This gives SpecDown a git-like working-copy flow without requiring a Git remote.

`sync` applies non-conflicting local and remote changes in one run. `sync --force` still leaves conflict paths unresolved, but continues the rest of the sync. `sync --watch` debounces filesystem change bursts and never overlaps two sync runs. Watch mode requires `--yes`.

### Image Uploads

```bash
specdown image ./diagram.png                     # Upload image and print markdown
specdown image ./diagram.png --doc /api/spec.md # Associate the asset with a document
```

### Delete

```bash
specdown rm /path/to/doc.md          # Delete a document (with confirmation)
specdown rm /path/to/doc.md --force  # Skip confirmation prompt
```

---

## CI/CD & DevOps Usage

Use the CLI in automation scripts and pipelines — no interactive prompts needed:

```bash
# Set token via env var (CI/CD)
SPECDOWN_ACCESS_TOKEN=<token> specdown ls

# Auto-publish spec from CI pipeline
specdown push ./docs/openapi.md /api/openapi.md

# Pull spec and validate in pipeline
specdown pull /api-spec.md > /tmp/spec.md && validate-spec /tmp/spec.md

# Spec-driven development: pull spec, pass to AI, implement
specdown pull /feature-spec.md | claude "implement this feature"
```

---

## AI-Native Integration — Spec CLI + Markdown MCP

Combine the CLI with the **[SpecDown MCP Server](https://github.com/specdown-app/mcp-server)** for full AI-native spec workflows — making your entire spec pipeline AI-operable:

| Tool | Use case |
|------|----------|
| `specdown-cli` | Terminal, CI/CD, scripting, automation |
| `specdown-mcp` | Claude, Cursor, Copilot — AI reads spec directly and can plan/apply sync operations |

```bash
# Your API key (from specdown login) works for both CLI and MCP
cat ~/.specdown/config.json
```

---

## Configuration

Credentials stored in `~/.specdown/config.json` after login:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user_email": "you@example.com",
  "user_id": "...",
  "current_project_slug": "my-project",
  "current_project_name": "My Project"
}
```

---

## Links

- [SpecDown](https://specdown.app) — Markdown editor online, Spec as Code platform
- [MCP Server](https://github.com/specdown-app/mcp-server) — Markdown MCP for AI assistants
- [Docs](https://specdown.app/docs)
- [GitHub](https://github.com/specdown-app/cli)
- [Report issue](https://github.com/specdown-app/cli/issues)

## License

MIT
