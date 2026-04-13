import { ask } from './prompt.js'
import type { SyncPlan } from './sync-plan.js'

export interface SyncPromptArgs {
  yes?: boolean
  force?: boolean
}

interface ShouldProceedOptions {
  ask?: (question: string) => Promise<string>
  isInteractive?: boolean
  prompt?: string
}

export async function shouldProceedWithSync(
  args: SyncPromptArgs = {},
  options: ShouldProceedOptions = {}
): Promise<boolean> {
  if (args.yes || args.force) {
    return true
  }

  const isInteractive = options.isInteractive ?? (Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY))
  if (!isInteractive) {
    throw new Error('Linked-folder sync requires an interactive terminal confirmation. Re-run with --yes or --force.')
  }

  const prompt = options.prompt ?? 'Proceed with sync? [y/N] '
  const answer = await (options.ask ?? ask)(prompt)
  return ['y', 'yes'].includes(answer.trim().toLowerCase())
}

export function formatSyncPlanSummary(plan: SyncPlan): string {
  return [
    `push ${plan.push.length}`,
    `pull ${plan.pull.length}`,
    `create-remote ${plan.createRemote.length}`,
    `create-local ${plan.createLocal.length}`,
    `delete-remote ${plan.deleteRemote.length}`,
    `delete-local ${plan.deleteLocal.length}`,
    `conflicts ${plan.conflicts.length}`,
  ].join(', ')
}

export function formatConflictSummary(plan: SyncPlan): string {
  return plan.conflicts.map((item) => item.path).join(', ')
}
