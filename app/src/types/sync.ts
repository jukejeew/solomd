/** Sync provider id — workspace ↔ remote backend. Mirrors the `provider`
 * string stored in `SyncStatus.provider` and the `providerChoice` picker
 * in `GithubSyncSettings.vue`. Kept as a union so unsafe casts are
 * unnecessary when assigning `sync.status.provider` to the local picker. */
export type SyncProviderId = 'github' | 'gitlab' | 'gitea' | 'custom';

/** Guard: true when a string is a known SyncProviderId. */
export function isSyncProviderId(v: string): v is SyncProviderId {
  return v === 'github' || v === 'gitlab' || v === 'gitea' || v === 'custom';
}
