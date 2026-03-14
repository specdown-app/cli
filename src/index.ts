import { Command } from 'commander'
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
import { rm } from './commands/rm.js'
import { search } from './commands/search.js'

const program = new Command()

program
  .name('specdown')
  .description('Manage SpecDown docs from your terminal')
  .version('0.1.0')

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
  .command('push <file> <doc-path>')
  .description('Upload a local file to a document path in SpecDown')
  .action(push)

program
  .command('pull <doc-path> [out-file]')
  .description('Download a document from SpecDown (or print to stdout)')
  .action(pull)

program
  .command('rm <path>')
  .description('Delete a document or folder (soft delete)')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(rm)

program.parseAsync(process.argv)
