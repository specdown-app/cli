#!/usr/bin/env bash
# deploy.sh — publish specdown CLI to npm and optionally update Homebrew tap
#
# Usage:
#   ./scripts/deploy.sh              # bump patch, publish to npm
#   ./scripts/deploy.sh --minor      # bump minor version
#   ./scripts/deploy.sh --major      # bump major version
#   ./scripts/deploy.sh --no-brew    # skip Homebrew tap update
#   ./scripts/deploy.sh --dry-run    # simulate without publishing
#
# Requirements:
#   - npm login (npmjs.com account)
#   - HOMEBREW_TAP_REPO env var set to owner/repo  (e.g. specdown/homebrew-tap)
#     or --no-brew flag to skip Homebrew step
#   - gh CLI authenticated (for Homebrew tap PR)

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
BUMP="patch"
SKIP_BREW=false
DRY_RUN=false
HOMEBREW_TAP_REPO="${HOMEBREW_TAP_REPO:-}"

# ── Parse args ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --minor)    BUMP="minor" ;;
    --major)    BUMP="major" ;;
    --no-brew)  SKIP_BREW=true ;;
    --dry-run)  DRY_RUN=true ;;
    *)          echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo "  \033[34mℹ\033[0m  $*"; }
success() { echo "  \033[32m✔\033[0m  $*"; }
warn()    { echo "  \033[33m⚠\033[0m  $*"; }
die()     { echo "  \033[31m✖\033[0m  $*" >&2; exit 1; }

run() {
  if $DRY_RUN; then
    echo "  \033[90m[dry-run]\033[0m $*"
  else
    eval "$*"
  fi
}

# ── Pre-flight checks ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

info "Working directory: $(pwd)"

command -v node  >/dev/null 2>&1 || die "node not found"
command -v npm   >/dev/null 2>&1 || die "npm not found"

# Check npm auth
if ! $DRY_RUN; then
  npm whoami >/dev/null 2>&1 || die "Not logged in to npm. Run: npm login"
fi

# Ensure clean git state
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  die "Working tree is dirty. Commit or stash changes first."
fi

# ── Build ─────────────────────────────────────────────────────────────────────
info "Installing dependencies…"
run "npm ci --silent"

info "Building…"
run "npm run build"
success "Build complete"

# ── Version bump ─────────────────────────────────────────────────────────────
info "Bumping $BUMP version…"
if $DRY_RUN; then
  NEW_VERSION=$(node -p "const v=require('./package.json').version.split('.'); v[{'patch':2,'minor':1,'major':0}['$BUMP']]++; if('$BUMP'==='minor')v[2]=0; if('$BUMP'==='major'){v[1]=0;v[2]=0;} v.join('.')")
  warn "[dry-run] Would bump to v$NEW_VERSION"
else
  NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version | sed 's/^v//')
  success "Version → v$NEW_VERSION"
fi

# ── Publish to npm ────────────────────────────────────────────────────────────
info "Publishing v$NEW_VERSION to npm…"
run "npm publish --access public"
success "Published specdown@$NEW_VERSION to npm  →  https://www.npmjs.com/package/specdown"

# ── Git tag ───────────────────────────────────────────────────────────────────
info "Committing version bump and tagging…"
run "git add package.json"
run "git commit -m \"chore: release v$NEW_VERSION\""
run "git tag \"v$NEW_VERSION\""
run "git push && git push --tags"
success "Tagged v$NEW_VERSION and pushed"

# ── Homebrew tap ──────────────────────────────────────────────────────────────
if $SKIP_BREW; then
  warn "Skipping Homebrew tap update (--no-brew)"
elif [[ -z "$HOMEBREW_TAP_REPO" ]]; then
  warn "HOMEBREW_TAP_REPO not set — skipping Homebrew tap update"
  warn "Set it with: export HOMEBREW_TAP_REPO=yourorg/homebrew-tap"
else
  info "Updating Homebrew tap ($HOMEBREW_TAP_REPO)…"

  # Download tarball and compute SHA256
  TARBALL_URL="https://registry.npmjs.org/specdown/-/specdown-$NEW_VERSION.tgz"

  if $DRY_RUN; then
    warn "[dry-run] Would fetch $TARBALL_URL and compute SHA256"
    SHA256="<sha256-placeholder>"
  else
    info "Computing SHA256 of published tarball…"
    SHA256=$(curl -fsSL "$TARBALL_URL" | shasum -a 256 | awk '{print $1}')
    success "SHA256: $SHA256"
  fi

  # Clone tap repo, update formula, push
  TMPDIR=$(mktemp -d)
  trap 'rm -rf "$TMPDIR"' EXIT

  run "git clone https://github.com/$HOMEBREW_TAP_REPO.git \"$TMPDIR/tap\""

  FORMULA="$TMPDIR/tap/Formula/specdown.rb"
  if $DRY_RUN; then
    warn "[dry-run] Would write formula to $FORMULA"
  else
    mkdir -p "$(dirname "$FORMULA")"
    cat > "$FORMULA" << FORMULA_EOF
class Specdown < Formula
  desc "CLI for SpecDown — manage spec docs from your terminal"
  homepage "https://specdown.app"
  url "$TARBALL_URL"
  sha256 "$SHA256"
  license "MIT"
  version "$NEW_VERSION"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/specdown --version")
  end
end
FORMULA_EOF
  fi

  run "cd \"$TMPDIR/tap\" && git add Formula/specdown.rb"
  run "cd \"$TMPDIR/tap\" && git commit -m \"specdown $NEW_VERSION\""
  run "cd \"$TMPDIR/tap\" && git push"
  success "Homebrew formula updated → brew install specdown/tap/specdown"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "  \033[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
echo "  \033[1m  specdown v$NEW_VERSION published\033[0m"
echo "  \033[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
echo ""
echo "  npm:      npm install -g specdown"
echo "  npx:      npx specdown --help"
if ! $SKIP_BREW && [[ -n "$HOMEBREW_TAP_REPO" ]]; then
  ORG="${HOMEBREW_TAP_REPO%%/*}"
  echo "  brew:     brew tap $ORG/tap && brew install specdown"
fi
echo ""
