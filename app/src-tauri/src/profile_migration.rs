//! One-time profile migration: upstream SoloMD (`app.solomd`) → SoloMD PE (`app.solomd.pe`).
//!
//! Why this exists: commit `fa26c7b` changed the Tauri `identifier` to give PE
//! a distinct identity. The identifier chooses `app_config_dir`
//! (`~/.config/<id>`), `app_data_dir` (`~/.local/share/<id>`) and the
//! WebKitGTK WebView profile (where `localStorage` lives) — so installing
//! pe.2 over upstream starts on a fresh empty profile while the old data
//! still sits on disk. dpkg `Conflicts/Replaces` removes the old *package*
//! but never touches `$HOME`, which is why every setting / tab / workspace /
//! session looked "lost" after the upgrade.
//!
//! Policy — never destroy user data:
//! - runs once per PE profile (marker file `.pe-migration-v1-done` in the
//!   NEW config dir); a second launch is a no-op.
//! - config + data files: copy-if-missing only, never overwrite.
//! - WebKit `localStorage` sqlite: copy missing keys only, EXCEPT
//!   `solomd.settings.v1`, which is restored from the old profile (the
//!   upgrade stranded months of customization; the new sqlite file is backed
//!   up before any write so the PE-era values stay recoverable).
//! - rebuildable caches (`CacheStorage`, `WebKitCache`, …) are skipped.
//! - if either sqlite DB is locked (old app still running), the run aborts
//!   WITHOUT stamping the marker so the next launch retries.
//!
//! OS keyring secrets need no migration: `ai_keystore::KEYRING_SERVICE` is
//! still `"solomd"`, so provider keys stay visible after the move — only the
//! settings blob pointing at them was stranded, which this fixes.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::{AppHandle, Manager};

/// Marker file stamped into the NEW config dir after a successful run.
const MARKER_FILE: &str = ".pe-migration-v1-done";
/// PE identifier suffix — the legacy profile dir is the new one minus this.
const PE_SUFFIX: &str = ".pe";
/// localStorage key holding the settings JSON blob.
const SETTINGS_KEY: &str = "solomd.settings.v1";
/// Top-level data-dir entries that are pure rebuildable caches.
const SKIP_DATA_DIRS: &[&str] = &["CacheStorage", "WebKitCache", "mediakeys", "GPUCache"];

#[derive(Debug, Default)]
pub struct MigrationReport {
    pub config_copied: u64,
    pub data_copied: u64,
    pub localstorage_files: u64,
    pub keys_inserted: u64,
    pub settings_restored: bool,
    pub backups_made: u64,
    pub already_done: bool,
}

/// Entry point, called once from the `setup` hook before the WebView opens
/// (so neither sqlite DB is locked by us yet).
pub fn run_profile_migration(app: &AppHandle) {
    let new_config = match app.path().app_config_dir() {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("pe migration: cannot resolve app_config_dir: {e}");
            return;
        }
    };
    let new_data = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("pe migration: cannot resolve app_data_dir: {e}");
            return;
        }
    };
    let (Some(legacy_config), Some(legacy_data)) =
        (legacy_sibling(&new_config), legacy_sibling(&new_data))
    else {
        return;
    };
    match migrate_dirs(&new_config, &legacy_config, &new_data, &legacy_data) {
        Ok(r) => tracing::info!(
            "pe migration: done (config_copied={} data_copied={} ls_files={} keys={} settings_restored={} already_done={})",
            r.config_copied,
            r.data_copied,
            r.localstorage_files,
            r.keys_inserted,
            r.settings_restored,
            r.already_done
        ),
        Err(e) => tracing::warn!("pe migration deferred, will retry next launch: {e}"),
    }
}

/// Derive the legacy profile dir from the new one by stripping the `.pe`
/// suffix (`…/app.solomd.pe` → `…/app.solomd`). Returns `None` when the dir
/// name carries no such suffix (mobile targets, dev builds, …) so the
/// migration provably no-ops there.
fn legacy_sibling(dir: &Path) -> Option<PathBuf> {
    let name = dir.file_name()?.to_str()?;
    let base = name.strip_suffix(PE_SUFFIX)?;
    if base.is_empty() {
        return None;
    }
    dir.parent().map(|p| p.join(base))
}

pub fn migrate_dirs(
    new_config: &Path,
    legacy_config: &Path,
    new_data: &Path,
    legacy_data: &Path,
) -> Result<MigrationReport, String> {
    let mut report = MigrationReport::default();
    if new_config == legacy_config || new_data == legacy_data {
        return Ok(report);
    }
    if !legacy_config.is_dir() && !legacy_data.is_dir() {
        // Fresh PE install, no upstream profile ever existed.
        stamp_marker(new_config)?;
        report.already_done = true;
        return Ok(report);
    }
    if new_config.join(MARKER_FILE).is_file() {
        report.already_done = true;
        return Ok(report);
    }
    if legacy_config.is_dir() {
        copy_missing_tree(legacy_config, new_config, &mut report, true)?;
    }
    if legacy_data.is_dir() {
        copy_missing_tree(legacy_data, new_data, &mut report, false)?;
        merge_localstorage_dir(
            &new_data.join("localstorage"),
            &legacy_data.join("localstorage"),
            &mut report,
        )?;
    }
    stamp_marker(new_config)?;
    Ok(report)
}

fn stamp_marker(new_config: &Path) -> Result<(), String> {
    std::fs::create_dir_all(new_config).map_err(|e| format!("mkdir new config: {e}"))?;
    std::fs::write(
        new_config.join(MARKER_FILE),
        "app.solomd -> app.solomd.pe one-time migration\n",
    )
    .map_err(|e| format!("write marker: {e}"))?;
    Ok(())
}

/// Copy every regular file under `src` to the same relative path under `dst`
/// when the destination is missing. `is_config` selects the skip rules:
/// config trees copy everything (except the marker), data trees skip
/// rebuildable caches and the WebKit localStorage mains (merged by key).
fn copy_missing_tree(
    src: &Path,
    dst: &Path,
    report: &mut MigrationReport,
    is_config: bool,
) -> Result<(), String> {
    for entry in walkdir::WalkDir::new(src)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let rel = entry
            .path()
            .strip_prefix(src)
            .map_err(|e| format!("relativize: {e}"))?;
        if entry.file_type().is_symlink() {
            continue;
        }
        if entry.file_type().is_dir() {
            continue;
        }
        if rel.to_str() == Some(MARKER_FILE) {
            continue;
        }
        if !is_config {
            let mut parts = rel.components();
            if let Some(std::path::Component::Normal(top)) = parts.next() {
                let top = top.to_string_lossy();
                if SKIP_DATA_DIRS.iter().any(|s| *s == top) {
                    continue;
                }
                if top == "localstorage" {
                    if let Some(name) = rel.file_name().and_then(|n| n.to_str()) {
                        if name.ends_with(".localstorage")
                            || name.ends_with(".localstorage-shm")
                            || name.ends_with(".localstorage-wal")
                        {
                            continue;
                        }
                    }
                }
            }
        }
        let target = dst.join(rel);
        if target.exists() {
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
        }
        std::fs::copy(entry.path(), &target).map_err(|e| format!("copy {}: {e}", rel.display()))?;
        if is_config {
            report.config_copied += 1;
        } else {
            report.data_copied += 1;
        }
    }
    Ok(())
}

/// Key-level merge for every `*.localstorage` sqlite pair present in the old
/// profile. Missing keys are copied; the settings blob is restored from the
/// old profile (the whole point of this migration — the upgrade stranded it).
fn merge_localstorage_dir(
    new_dir: &Path,
    old_dir: &Path,
    report: &mut MigrationReport,
) -> Result<(), String> {
    if !old_dir.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(new_dir).map_err(|e| format!("mkdir localstorage: {e}"))?;
    let mut names: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(old_dir).map_err(|e| format!("read old localstorage: {e}"))? {
        let entry = entry.map_err(|e| format!("read dir entry: {e}"))?;
        if !entry
            .file_type()
            .map_err(|e| format!("file type: {e}"))?
            .is_file()
        {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(".localstorage") {
            names.push(name);
        }
    }
    names.sort();
    for name in names {
        merge_localstorage_file(&new_dir.join(&name), &old_dir.join(&name), report)?;
    }
    Ok(())
}

fn merge_localstorage_file(
    new_file: &Path,
    old_file: &Path,
    report: &mut MigrationReport,
) -> Result<(), String> {
    if !new_file.is_file() {
        copy_trio(old_file, new_file)?;
        report.localstorage_files += 1;
        return Ok(());
    }
    let old_rows =
        read_ls_rows(old_file).map_err(|e| format!("read old {}: {e}", old_file.display()))?;
    if old_rows.is_empty() {
        return Ok(());
    }
    // Checkpoint our own WAL into the main file first so the backup below is
    // a single self-contained file.
    {
        let con =
            open_ls_rw(new_file).map_err(|e| format!("open new {}: {e}", new_file.display()))?;
        let _ = con.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    backup_file(new_file, report)?;
    let new_con =
        open_ls_rw(new_file).map_err(|e| format!("open new {}: {e}", new_file.display()))?;
    let existing: HashSet<String> = {
        let mut stmt = new_con
            .prepare("SELECT key FROM ItemTable")
            .map_err(|e| format!("prepare: {e}"))?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| format!("query existing keys: {e}"))?;
        rows.collect::<Result<HashSet<_>, _>>()
            .map_err(|e| format!("collect keys: {e}"))?
    };
    let mut inserted = 0u64;
    for (key, value) in &old_rows {
        if existing.contains(key) {
            continue;
        }
        new_con
            .execute(
                "INSERT INTO ItemTable(key, value) VALUES (?1, ?2)",
                rusqlite::params![key.as_str(), value.as_slice()],
            )
            .map_err(|e| format!("insert {key}: {e}"))?;
        inserted += 1;
    }
    // Settings restore: the upgrade stranded the user's long-lived
    // customizations in the old profile, so the old blob wins when it
    // differs. The PE-era blob is preserved in the pre-migration backup.
    if existing.contains(SETTINGS_KEY) {
        if let Some(old_raw) = old_rows
            .iter()
            .find(|(k, _)| k == SETTINGS_KEY)
            .map(|(_, v)| v)
        {
            let new_raw = read_ls_value(&new_con, SETTINGS_KEY)?;
            if old_raw != &new_raw {
                new_con
                    .execute(
                        "UPDATE ItemTable SET value = ?1 WHERE key = ?2",
                        rusqlite::params![old_raw.as_slice(), SETTINGS_KEY],
                    )
                    .map_err(|e| format!("restore settings: {e}"))?;
                report.settings_restored = true;
            }
        }
    }
    report.localstorage_files += 1;
    report.keys_inserted += inserted;
    Ok(())
}

fn open_ls_rw(path: &Path) -> Result<rusqlite::Connection, String> {
    let con =
        rusqlite::Connection::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
    con.busy_timeout(Duration::from_secs(2))
        .map_err(|e| format!("busy timeout: {e}"))?;
    Ok(con)
}

fn read_ls_rows(path: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    let con =
        rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| format!("open ro {}: {e}", path.display()))?;
    con.busy_timeout(Duration::from_secs(2))
        .map_err(|e| format!("busy timeout: {e}"))?;
    let mut stmt = con
        .prepare("SELECT key, value FROM ItemTable")
        .map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?))
        })
        .map_err(|e| format!("query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect: {e}"))
}

fn read_ls_value(con: &rusqlite::Connection, key: &str) -> Result<Vec<u8>, String> {
    con.query_row(
        "SELECT value FROM ItemTable WHERE key = ?1",
        rusqlite::params![key],
        |r| r.get::<_, Vec<u8>>(0),
    )
    .map_err(|e| format!("read {key}: {e}"))
}

/// Copy a sqlite trio (main + `-shm` / `-wal` when present).
fn copy_trio(src_main: &Path, dst_main: &Path) -> Result<(), String> {
    if let Some(parent) = dst_main.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    for suffix in ["", "-shm", "-wal"] {
        let src = PathBuf::from(format!("{}{suffix}", src_main.display()));
        if src.is_file() {
            let dst = PathBuf::from(format!("{}{suffix}", dst_main.display()));
            std::fs::copy(&src, &dst).map_err(|e| format!("copy trio: {e}"))?;
        }
    }
    Ok(())
}

/// One-time backup of the new (PE) sqlite main file; kept for manual
/// recovery, never overwritten once it exists.
fn backup_file(path: &Path, report: &mut MigrationReport) -> Result<(), String> {
    let backup = PathBuf::from(format!("{}.pre-pe-migration-backup", path.display()));
    if backup.is_file() {
        return Ok(());
    }
    std::fs::copy(path, &backup).map_err(|e| format!("backup {}: {e}", path.display()))?;
    report.backups_made += 1;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_dir(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("pe-migration-test-{tag}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Encode a localStorage value the way WebKit does: UTF-16LE + NUL.
    fn webkit_encode(text: &str) -> Vec<u8> {
        let mut out = Vec::new();
        for u in text.encode_utf16() {
            out.extend_from_slice(&u.to_le_bytes());
        }
        out.extend_from_slice(&[0, 0]);
        out
    }

    fn make_ls_db(path: &Path, rows: &[(&str, Vec<u8>)]) {
        let con = rusqlite::Connection::open(path).unwrap();
        con.execute_batch(
            "CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB NOT NULL ON CONFLICT FAIL)",
        )
        .unwrap();
        for (k, v) in rows {
            con.execute(
                "INSERT INTO ItemTable(key, value) VALUES (?1, ?2)",
                rusqlite::params![*k, v.as_slice()],
            )
            .unwrap();
        }
    }

    fn ls_value(path: &Path, key: &str) -> Option<Vec<u8>> {
        let con = rusqlite::Connection::open(path).ok()?;
        con.query_row(
            "SELECT value FROM ItemTable WHERE key = ?1",
            rusqlite::params![key],
            |r| r.get::<_, Vec<u8>>(0),
        )
        .ok()
    }

    fn fresh_settings() -> Vec<u8> {
        webkit_encode(
            r#"{"welcomeShown":false,"telemetryNoticeAck":false,"agentWizardSeen":false,"fontSize":14}"#,
        )
    }

    fn used_settings() -> Vec<u8> {
        webkit_encode(
            r#"{"welcomeShown":true,"telemetryNoticeAck":true,"agentWizardSeen":true,"fontSize":18,"theme":"dark"}"#,
        )
    }

    #[test]
    fn legacy_sibling_strips_pe_suffix() {
        assert_eq!(
            legacy_sibling(Path::new("/home/u/.config/app.solomd.pe")),
            Some(PathBuf::from("/home/u/.config/app.solomd"))
        );
        assert_eq!(
            legacy_sibling(Path::new("/home/u/.config/app.solomd")),
            None
        );
        assert_eq!(legacy_sibling(Path::new("/home/u/.config/solomd")), None);
    }

    #[test]
    fn copies_missing_config_files_without_overwrite() {
        let root = unique_dir("config");
        let legacy = root.join("app.solomd");
        let new = root.join("app.solomd.pe");
        std::fs::create_dir_all(legacy.join("themes")).unwrap();
        std::fs::create_dir_all(new.join("themes")).unwrap();
        std::fs::write(legacy.join("cost-meter.json"), r#"{"old":true}"#).unwrap();
        std::fs::write(legacy.join("themes/a.css"), "old-a").unwrap();
        std::fs::write(new.join("themes/a.css"), "new-a").unwrap();

        let report = migrate_dirs(
            &new,
            &legacy,
            &root.join("share-new"),
            &root.join("share-old"),
        )
        .unwrap();
        assert_eq!(report.config_copied, 1);
        assert_eq!(
            std::fs::read_to_string(new.join("cost-meter.json")).unwrap(),
            r#"{"old":true}"#
        );
        // Never overwrite the user's newer file.
        assert_eq!(
            std::fs::read_to_string(new.join("themes/a.css")).unwrap(),
            "new-a"
        );
        assert!(new.join(MARKER_FILE).is_file());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn merges_missing_keys_and_restores_fresh_settings() {
        let root = unique_dir("merge");
        let legacy = root.join("app.solomd");
        let new = root.join("app.solomd.pe");
        std::fs::create_dir_all(legacy.join("localstorage")).unwrap();
        std::fs::create_dir_all(new.join("localstorage")).unwrap();
        make_ls_db(
            &legacy.join("localstorage/tauri_localhost_0.localstorage"),
            &[
                ("solomd.settings.v1", used_settings()),
                (
                    "solomd.workspace.v1",
                    webkit_encode(r#"{"folder":"/vault"}"#),
                ),
            ],
        );
        make_ls_db(
            &new.join("localstorage/tauri_localhost_0.localstorage"),
            &[
                ("solomd.settings.v1", fresh_settings()),
                ("solomd.anonId", webkit_encode("new-id")),
            ],
        );

        // share dirs must exist for migrate_dirs; data merge runs on localstorage.
        let legacy_data = root.join("share-old");
        let new_data = root.join("share-new");
        std::fs::create_dir_all(legacy_data.join("localstorage")).unwrap();
        std::fs::create_dir_all(new_data.join("localstorage")).unwrap();
        std::fs::copy(
            legacy.join("localstorage/tauri_localhost_0.localstorage"),
            legacy_data.join("localstorage/tauri_localhost_0.localstorage"),
        )
        .unwrap();
        std::fs::copy(
            new.join("localstorage/tauri_localhost_0.localstorage"),
            new_data.join("localstorage/tauri_localhost_0.localstorage"),
        )
        .unwrap();

        let report = migrate_dirs(&new, &legacy, &new_data, &legacy_data).unwrap();
        assert!(report.settings_restored);
        assert!(report.keys_inserted >= 1);
        let merged = new_data.join("localstorage/tauri_localhost_0.localstorage");
        assert_eq!(
            ls_value(&merged, "solomd.workspace.v1").unwrap(),
            webkit_encode(r#"{"folder":"/vault"}"#)
        );
        assert_eq!(
            ls_value(&merged, "solomd.settings.v1").unwrap(),
            used_settings()
        );
        // Untouched keys stay.
        assert_eq!(
            ls_value(&merged, "solomd.anonId").unwrap(),
            webkit_encode("new-id")
        );
        // Backup kept for manual recovery.
        assert!(PathBuf::from(format!("{}.pre-pe-migration-backup", merged.display())).is_file());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn restores_old_settings_over_rebuilt_new() {
        // The PE-era blob was already re-customized after the upgrade, but
        // the old profile still wins (its months of tweaks outrank a day of
        // rebuilding); the PE blob survives in the pre-migration backup.
        let root = unique_dir("rebuild");
        let legacy_data = root.join("share-old");
        let new_data = root.join("share-new");
        std::fs::create_dir_all(legacy_data.join("localstorage")).unwrap();
        std::fs::create_dir_all(new_data.join("localstorage")).unwrap();
        let rebuilt = webkit_encode(
            r#"{"welcomeShown":true,"telemetryNoticeAck":false,"agentWizardSeen":true,"fontSize":19}"#,
        );
        make_ls_db(
            &legacy_data.join("localstorage/tauri_localhost_0.localstorage"),
            &[
                ("solomd.settings.v1", used_settings()),
                (
                    "solomd.workspace.v1",
                    webkit_encode(r#"{"folder":"/vault"}"#),
                ),
            ],
        );
        make_ls_db(
            &new_data.join("localstorage/tauri_localhost_0.localstorage"),
            &[("solomd.settings.v1", rebuilt.clone())],
        );

        let report = migrate_dirs(
            &root.join("cfg-new"),
            &root.join("cfg-old"),
            &new_data,
            &legacy_data,
        )
        .unwrap();
        assert!(report.settings_restored);
        let merged = new_data.join("localstorage/tauri_localhost_0.localstorage");
        assert_eq!(
            ls_value(&merged, "solomd.settings.v1").unwrap(),
            used_settings()
        );
        // The rebuilt PE blob is preserved in the backup, not destroyed.
        let backup = PathBuf::from(format!("{}.pre-pe-migration-backup", merged.display()));
        assert!(backup.is_file());
        assert_eq!(ls_value(&backup, "solomd.settings.v1").unwrap(), rebuilt);
        // Missing keys still merge.
        assert!(ls_value(&merged, "solomd.workspace.v1").is_some());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn skips_identical_settings_without_backup_flag() {
        // Old and new blobs identical → no restore, but the run still
        // succeeds and stamps the marker (covered by second_run_is_noop).
        let root = unique_dir("identical");
        let legacy_data = root.join("share-old");
        let new_data = root.join("share-new");
        std::fs::create_dir_all(legacy_data.join("localstorage")).unwrap();
        std::fs::create_dir_all(new_data.join("localstorage")).unwrap();
        make_ls_db(
            &legacy_data.join("localstorage/tauri_localhost_0.localstorage"),
            &[("solomd.settings.v1", used_settings())],
        );
        make_ls_db(
            &new_data.join("localstorage/tauri_localhost_0.localstorage"),
            &[("solomd.settings.v1", used_settings())],
        );

        let report = migrate_dirs(
            &root.join("cfg-new"),
            &root.join("cfg-old"),
            &new_data,
            &legacy_data,
        )
        .unwrap();
        assert!(!report.settings_restored);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn second_run_is_noop() {
        let root = unique_dir("noop");
        let legacy = root.join("app.solomd");
        let new = root.join("app.solomd.pe");
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::write(legacy.join("a.txt"), "a").unwrap();
        let first = migrate_dirs(&new, &legacy, &root.join("d-new"), &root.join("d-old")).unwrap();
        assert!(!first.already_done);
        let second = migrate_dirs(&new, &legacy, &root.join("d-new"), &root.join("d-old")).unwrap();
        assert!(second.already_done);
        assert_eq!(second.config_copied, 0);
        let _ = std::fs::remove_dir_all(&root);
    }
}
