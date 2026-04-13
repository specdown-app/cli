import { Command } from 'commander'
import { checkForUpdate } from './lib/update-check.js'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const _require = createRequire(import.meta.url)
const _pkg = _require(join(dirname(fileURLToPath(import.meta.url)), '../package.json')) as { version: string }

checkForUpdate(_pkg.version)
import { login } from './commands/login.js'
import { logout } from './commands/logout.js'
import { whoami } from './commands/whoami.js'
import { listProjects } from './commands/projects.js'
import { useProject } from './commands/use.js'
import { ls } from './commands/ls.js'
import { readDoc } from './commands/read.js'
import { newDoc } from './commands/new.js'
import { push } from './commands/push.js'
import { pull } from './commands/pull.js'
import { diffLinkedProject } from './commands/diff.js'
import { rm } from './commands/rm.js'
import { search } from './commands/search.js'
import { uploadImage } from './commands/image.js'
import { linkProject } from './commands/link.js'
import { unlinkProject } from './commands/unlink.js'
import { status } from './commands/status.js'
import { syncLinkedProject } from './commands/sync.js'

const program = new Command()

program
  .name('specdown')
  .description('AI-native Markdown spec manager — manage docs, sync Git, and connect AI assistants from your terminal')
  .version(_pkg.version)

program
  .command('login')
  .description('Log in to SpecDown')
  .action(login)

program
  .command('logout')
  .description('Log out')
  .action(logout)

program
  .command('whoami')
  .description('Show current user and active project')
  .action(whoami)

program
  .command('projects')
  .description('List all projects you have access to')
  .action(listProjects)

program
  .command('use <slug>')
  .description('Switch active project by slug')
  .action(useProject)

program
  .command('link <slug>')
  .description('Link the active local folder to a SpecDown project')
  .option('-d, --dir <path>', 'Local directory to link', '.')
  .option('-p, --prefix <path>', 'Remote path prefix', '/')
  .action(linkProject)

program
  .command('unlink')
  .description('Remove the SpecDown project link from this folder')
  .option('-d, --dir <path>', 'Local directory to unlink', '.')
  .action(unlinkProject)

program
  .command('status')
  .description('Show sync status for the linked local folder')
  .option('-d, --dir <path>', 'Local directory to inspect', '.')
  .action(status)

program
  .command('ls')
  .description('List documents in the active project')
  .action(ls)

program
  .command('read <path>')
  .description('Print a document to stdout')
  .option('--from <line>', 'Start line (1-based, inclusive)')
  .option('--to <line>', 'End line (1-based, inclusive)')
  .option('-n, --line-numbers', 'Show line numbers')
  .action(readDoc)

program
  .command('search <query>')
  .description('Search text across the whole project or specific files')
  .option('--files <paths>', 'Comma-separated doc paths to restrict search (e.g. "api,docs/guide")')
  .option('-C, --context <n>', 'Lines of context around each match', '2')
  .action(search)

program
  .command('new <title>')
  .description('Create a new document (or folder with --folder)')
  .option('-f, --folder', 'Create a folder instead of a document')
  .option('-p, --parent <path>', 'Parent folder path')
  .action(newDoc)

program
  .command('push [file] [doc-path]')
  .description('Upload a local file to a document path in SpecDown')
  .option('--yes', 'Skip sync confirmation prompt')
  .option('-f, --force', 'Continue sync even if conflicts are detected')
  .option('-d, --dir <path>', 'Linked directory', '.')
  .action(push)

program
  .command('image <file>')
  .description('Upload a local image and print the markdown link')
  .option('-d, --doc <path>', 'Associate the image with a specific document path')
  .action(uploadImage)

program
  .command('pull [doc-path] [out-file]')
  .description('Download a document from SpecDown (or print to stdout)')
  .option('--yes', 'Skip sync confirmation prompt')
  .option('-f, --force', 'Continue sync even if conflicts are detected')
  .option('-d, --dir <path>', 'Linked directory', '.')
  .action(pull)

program
  .command('diff')
  .description('Show differences between the linked local folder and the remote SpecDown project')
  .option('-d, --dir <path>', 'Linked directory', '.')
  .action(diffLinkedProject)

program
  .command('sync')
  .description('Sync the linked local folder with SpecDown')
  .option('--watch', 'Continuously watch the linked folder for changes')
  .option('--yes', 'Skip confirmation prompts')
  .option('-f, --force', 'Force overwrite during conflicts')
  .option('-d, --dir <path>', 'Linked directory', '.')
  .action(syncLinkedProject)

program
  .command('rm <path>')
  .description('Delete a document or folder (soft delete)')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(rm)

program.parseAsync(process.argv)
