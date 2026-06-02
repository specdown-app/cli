import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { ask } from '../lib/prompt.js'
import { normalizePath } from '../lib/path.js'

export async function rm(docPath: string, opts: { force?: boolean }) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = await getClient(cfg)
  const fullPath = normalizePath(docPath)
  const spinner = ora(`Looking up ${fullPath}…`).start()

  try {
    // 1) Resolve target doc. Use maybeSingle so missing rows give us a
    //    clearer error than the PostgREST "exactly one row" rejection.
    const { data: target, error: lookupErr } = await supabase
      .from('documents')
      .select('id, title, is_folder, full_path')
      .eq('project_id', project.id)
      .is('deleted_at', null)
      .eq('full_path', fullPath)
      .maybeSingle()

    if (lookupErr) {
      spinner.fail(chalk.red(`Lookup failed: ${lookupErr.message}`))
      process.exit(1)
    }

    // No direct doc match — the path might still be a "virtual" folder, i.e.
    // a prefix shared by other docs / attachments without its own documents
    // row. Common after CLI / git-sync imports that never created folder
    // rows. Fall through to a prefix-based bulk delete in that case.
    if (!target) {
      const prefix = fullPath.replace(/\/+$/, '')
      const [{ data: docsUnder, error: docErr }, { data: filesUnder, error: fileErr }] = await Promise.all([
        supabase
          .from('documents')
          .select('id, title')
          .eq('project_id', project.id)
          .is('deleted_at', null)
          .ilike('full_path', `${prefix}/%`),
        supabase
          .from('project_files')
          .select('id, title')
          .eq('project_id', project.id)
          .is('deleted_at', null)
          .ilike('full_path', `${prefix}/%`),
      ])
      if (docErr) { spinner.fail(chalk.red(docErr.message)); process.exit(1) }
      if (fileErr) { spinner.fail(chalk.red(fileErr.message)); process.exit(1) }
      const docCount = docsUnder?.length ?? 0
      const fileCount = filesUnder?.length ?? 0
      if (docCount === 0 && fileCount === 0) {
        spinner.fail(chalk.red(`Nothing found at or under ${fullPath}`))
        process.exit(1)
      }

      spinner.stop()

      if (!opts.force) {
        const answer = await ask(
          chalk.yellow(
            `${fullPath} is a virtual folder (no folder doc). `
            + `Delete ${docCount} doc(s) and ${fileCount} attachment(s) inside? [y/N] `
          )
        )
        if (answer.toLowerCase() !== 'y') {
          console.log('Aborted.')
          return
        }
      }

      const deleteSpinner = ora('Deleting…').start()
      const now = new Date().toISOString()
      let deletedDocs = 0
      let deletedFiles = 0
      if (docCount > 0) {
        const { data, error } = await supabase
          .from('documents')
          .update({ deleted_at: now })
          .eq('project_id', project.id)
          .is('deleted_at', null)
          .ilike('full_path', `${prefix}/%`)
          .select('id')
        if (error) { deleteSpinner.fail(chalk.red(error.message)); process.exit(1) }
        deletedDocs = data?.length ?? 0
      }
      if (fileCount > 0) {
        const { data, error } = await supabase
          .from('project_files')
          .update({ deleted_at: now })
          .eq('project_id', project.id)
          .is('deleted_at', null)
          .ilike('full_path', `${prefix}/%`)
          .select('id')
        if (error) { deleteSpinner.fail(chalk.red(error.message)); process.exit(1) }
        deletedFiles = data?.length ?? 0
      }
      if (deletedDocs === 0 && deletedFiles === 0) {
        deleteSpinner.fail(chalk.red(
          'Soft-delete affected 0 rows — RLS likely blocked the UPDATE. '
          + 'Confirm your CLI session has edit access to this project.'
        ))
        process.exit(1)
      }
      deleteSpinner.succeed(chalk.green(
        `Deleted: ${fullPath} (${deletedDocs} doc${deletedDocs === 1 ? '' : 's'}, `
        + `${deletedFiles} attachment${deletedFiles === 1 ? '' : 's'})`
      ))
      return
    }

    // 2) Enumerate descendants. Folders get a full cascade so children and
    //    attachments aren't orphaned in the tree (which is what made the old
    //    behaviour look like "delete didn't work" — the folder reappeared on
    //    refresh because the project_files at the same prefix were still
    //    alive, so the UI rebuilt it as a virtual folder).
    const idsToDelete = new Set<string>([target.id])

    if (target.is_folder) {
      // BFS by parent_id — catches children created with a real parent link.
      let frontier: string[] = [target.id]
      while (frontier.length > 0) {
        const { data: kids, error: bfsErr } = await supabase
          .from('documents')
          .select('id')
          .eq('project_id', project.id)
          .is('deleted_at', null)
          .in('parent_id', frontier)
        if (bfsErr) throw new Error(`BFS lookup failed: ${bfsErr.message}`)
        const fresh = (kids ?? []).map((r) => r.id).filter((id) => !idsToDelete.has(id))
        if (fresh.length === 0) break
        fresh.forEach((id) => idsToDelete.add(id))
        frontier = fresh
      }

      // Path-prefix scan — catches docs whose parent_id was never repaired
      // after a move / import. ILIKE so case drift between the folder slug
      // (lowercased on creation) and stored child paths doesn't hide rows.
      const prefix = target.full_path.replace(/\/+$/, '')
      const { data: byPath, error: pathErr } = await supabase
        .from('documents')
        .select('id')
        .eq('project_id', project.id)
        .is('deleted_at', null)
        .ilike('full_path', `${prefix}/%`)
      if (pathErr) throw new Error(`Path scan failed: ${pathErr.message}`)
      for (const row of byPath ?? []) idsToDelete.add(row.id)
    }

    spinner.stop()

    if (!opts.force) {
      const summary = target.is_folder
        ? `Delete folder "${target.title}" and ${idsToDelete.size - 1} descendant(s) + any attachments inside?`
        : `Delete "${target.title}"?`
      const answer = await ask(chalk.yellow(`${summary} [y/N] `))
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.')
        return
      }
    }

    // 3) Soft-delete docs. .select('id') so we get back the actual count and
    //    can throw a clear error if RLS silently filtered everything out
    //    (the previous "no rows affected, no error" path).
    const deleteSpinner = ora('Deleting…').start()
    const now = new Date().toISOString()
    const idList = Array.from(idsToDelete)
    const { data: deletedDocs, error: delErr } = await supabase
      .from('documents')
      .update({ deleted_at: now })
      .in('id', idList)
      .is('deleted_at', null)
      .select('id')
    if (delErr) throw new Error(`Document update failed: ${delErr.message}`)
    if (!deletedDocs || deletedDocs.length === 0) {
      throw new Error(
        `Soft-delete affected 0 rows (expected ${idList.length}). `
        + 'Most likely RLS blocked the UPDATE — your CLI session may not have edit access to this project.'
      )
    }

    // 4) Folder → cascade to project_files at the same prefix. ILIKE catches
    //    case drift between the lowercase folder slug and attachments stored
    //    with their original-case path (e.g. an /A-013 folder with
    //    /A-013/flow.png attachments).
    let attachmentsDeleted = 0
    if (target.is_folder) {
      const prefix = target.full_path.replace(/\/+$/, '')
      const { data: deletedFiles, error: fileErr } = await supabase
        .from('project_files')
        .update({ deleted_at: now })
        .eq('project_id', project.id)
        .is('deleted_at', null)
        .ilike('full_path', `${prefix}/%`)
        .select('id')
      if (fileErr) throw new Error(`Attachment cascade failed: ${fileErr.message}`)
      attachmentsDeleted = deletedFiles?.length ?? 0
    }

    const detail = target.is_folder
      ? ` (${deletedDocs.length} doc${deletedDocs.length === 1 ? '' : 's'}, ${attachmentsDeleted} attachment${attachmentsDeleted === 1 ? '' : 's'})`
      : ''
    deleteSpinner.succeed(chalk.green(`Deleted: ${fullPath}${detail}`))
  } catch (err) {
    spinner.fail(chalk.red(err instanceof Error ? err.message : 'Delete failed'))
    process.exit(1)
  }
}
