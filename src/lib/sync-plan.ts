export interface SyncFileSnapshot {
  path: string
  hash: string
  documentId?: string
}

export interface SyncConflict {
  path: string
  local?: SyncFileSnapshot
  remote?: SyncFileSnapshot
  base?: SyncFileSnapshot
}

export interface SyncPlan {
  push: SyncFileSnapshot[]
  pull: SyncFileSnapshot[]
  createRemote: SyncFileSnapshot[]
  createLocal: SyncFileSnapshot[]
  deleteRemote: SyncFileSnapshot[]
  deleteLocal: SyncFileSnapshot[]
  conflicts: SyncConflict[]
}

function buildSnapshotMap(files: SyncFileSnapshot[]): Map<string, SyncFileSnapshot> {
  return new Map(files.map((file) => [file.path, file]))
}

export function buildSyncPlan(input: {
  localFiles: SyncFileSnapshot[]
  remoteFiles: SyncFileSnapshot[]
  stateFiles: SyncFileSnapshot[]
}): SyncPlan {
  const localByPath = buildSnapshotMap(input.localFiles)
  const remoteByPath = buildSnapshotMap(input.remoteFiles)
  const stateByPath = buildSnapshotMap(input.stateFiles)
  const paths = new Set([...localByPath.keys(), ...remoteByPath.keys(), ...stateByPath.keys()])

  const plan: SyncPlan = {
    push: [],
    pull: [],
    createRemote: [],
    createLocal: [],
    deleteRemote: [],
    deleteLocal: [],
    conflicts: [],
  }

  for (const path of paths) {
    const local = localByPath.get(path)
    const remote = remoteByPath.get(path)
    const base = stateByPath.get(path)

    if (local && remote) {
      if (local.hash === remote.hash) continue

      if (base?.hash === remote.hash && base.hash !== local.hash) {
        plan.push.push(local)
        continue
      }

      if (base?.hash === local.hash && base.hash !== remote.hash) {
        plan.pull.push(remote)
        continue
      }

      if (!base) {
        plan.conflicts.push({ path, local, remote })
        continue
      }

      plan.conflicts.push({ path, local, remote, base })
      continue
    }

    if (local && !remote) {
      if (!base) {
        plan.createRemote.push(local)
        continue
      }

      if (base.hash === local.hash) {
        plan.deleteLocal.push(local)
        continue
      }

      plan.conflicts.push({ path, local, base })
      continue
    }

    if (!local && remote) {
      if (!base) {
        plan.createLocal.push(remote)
        continue
      }

      if (base.hash === remote.hash) {
        plan.deleteRemote.push(remote)
        continue
      }

      plan.conflicts.push({ path, remote, base })
    }
  }

  return plan
}
