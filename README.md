# SpecDown CLI

<p align="center">
  <img src="https://img.shields.io/npm/v/specdown?color=blue" alt="npm version" />
  <img src="https://img.shields.io/node/v/specdown" alt="node" />
  <img src="https://img.shields.io/npm/dm/specdown" alt="downloads" />
</p>

**CLI for [SpecDown](https://specdown.app)** — manage your Markdown spec docs from the terminal.
Read, write, push, pull, and search spec documents. Works great in CI/CD pipelines and AI automation scripts.

---

## Install

```bash
# Run without installing (recommended):
npx specdown --help

# Or install globally:
npm install -g specdown
```

**Requirements:** Node.js ≥ 18

---

## Quick Start

```bash
# 1. Login
specdown login

# 2. Switch to a project
specdown use my-project-slug

# 3. List documents
specdown ls

# 4. Read a document
specdown read /README.md
```

---

## Commands

### Authentication

```bash
specdown login           # Sign in with email + password
specdown logout          # Sign out and clear credentials
specdown whoami          # Show current user and active project
```

### Projects

```bash
specdown projects        # List all projects you have access to
specdown use <slug>      # Switch active project
```

### Documents

```bash
specdown ls                          # List documents in active project
specdown read <path>                 # Print document content to stdout
specdown read <path> --from 10 --to 50   # Print lines 10–50
specdown read <path> -n              # Print with line numbers
```

### Search

```bash
specdown search "authentication flow"
specdown search "api" --files "design,api-spec"   # Restrict to specific docs
specdown search "TODO" -C 5                       # 5 lines of context
```

### Create & Edit

```bash
specdown new "API Design"            # Create a new document
specdown new "Design" --folder       # Create a folder
specdown new "Auth" -p /design       # Create inside a folder
```

### Sync

```bash
specdown push ./local-file.md /remote/path.md    # Upload local file to SpecDown
specdown pull /remote/path.md                    # Print remote doc to stdout
specdown pull /remote/path.md out.md             # Save to local file
```

### Delete

```bash
specdown rm /path/to/doc.md          # Delete a document (with confirmation)
specdown rm /path/to/doc.md --force  # Skip confirmation
```

---

## Configuration

Credentials are stored in `~/.specdown/config.json` after login. No environment variables required for standard use.

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

## CI/CD Usage

Use environment variables for non-interactive environments:

```bash
# In CI: set token directly, skip login prompt
SPECDOWN_ACCESS_TOKEN=<token> specdown ls
```

Or use the CLI in automation scripts:

```bash
# Pull latest spec and pass to AI
specdown pull /api-spec.md | claude "suggest improvements"

# Auto-publish docs from CI
specdown push ./docs/openapi.md /api/openapi.md
```

---

## AI Usage (MCP)

Pair the CLI with the [SpecDown MCP Server](https://github.com/specdown-app/mcp-server) to give Claude, Cursor, and other AI assistants direct access to your specs:

```bash
# Install MCP server
npm install -g specdown-mcp

# Your API key is in ~/.specdown/config.json after login
cat ~/.specdown/config.json
```

---

## Links

- [SpecDown](https://specdown.app) — Spec-as-Code platform
- [Docs](https://specdown.app/docs)
- [MCP Server](https://github.com/specdown-app/mcp-server) — AI integration
- [GitHub](https://github.com/specdown-app/cli)
- [Report issue](https://github.com/specdown-app/cli/issues)

## License

MIT
