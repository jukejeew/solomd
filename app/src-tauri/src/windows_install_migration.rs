#[cfg(target_os = "windows")]
const LEGACY_UNINSTALL_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Uninstall\SoloMD";
#[cfg(target_os = "windows")]
const LEGACY_PRODUCT_KEY: &str = r"Software\zhitong\SoloMD";

#[cfg(any(target_os = "windows", test))]
fn normalize_windows_path(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

#[cfg(any(target_os = "windows", test))]
fn is_expected_install_layout(
    current_exe: &str,
    program_files: &str,
    legacy_location: &str,
    local_app_data: &str,
) -> bool {
    let current_exe = normalize_windows_path(current_exe);
    let expected_current = format!(
        r"{}\solomd\solomd.exe",
        normalize_windows_path(program_files)
    );
    let legacy_location = normalize_windows_path(legacy_location);
    let expected_legacy = format!(r"{}\solomd", normalize_windows_path(local_app_data));

    current_exe == expected_current && legacy_location == expected_legacy
}

#[cfg(target_os = "windows")]
pub fn migrate_legacy_nsis_install() {
    use std::{env, path::PathBuf, process::Command};
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let Ok(current_exe) = env::current_exe() else {
        return;
    };
    let (Ok(program_files), Ok(local_app_data)) =
        (env::var("ProgramFiles"), env::var("LOCALAPPDATA"))
    else {
        return;
    };

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(uninstall_key) = hkcu.open_subkey(LEGACY_UNINSTALL_KEY) else {
        return;
    };
    let Ok(install_location) = uninstall_key.get_value::<String, _>("InstallLocation") else {
        return;
    };
    let Ok(product_key) = hkcu.open_subkey(LEGACY_PRODUCT_KEY) else {
        return;
    };
    let Ok(product_location) = product_key.get_value::<String, _>("") else {
        return;
    };

    let current_exe_text = current_exe.to_string_lossy();
    if !is_expected_install_layout(
        &current_exe_text,
        &program_files,
        &install_location,
        &local_app_data,
    ) || normalize_windows_path(&product_location) != normalize_windows_path(&install_location)
    {
        return;
    }

    let legacy_dir = PathBuf::from(install_location.trim().trim_matches('"'));
    let legacy_uninstaller = legacy_dir.join("uninstall.exe");
    let legacy_executable = legacy_dir.join("SoloMD.exe");
    if !legacy_uninstaller.is_file() || !legacy_executable.is_file() {
        return;
    }

    // Let the original NSIS uninstaller remove only the installation it owns:
    // its files, HKCU uninstall entry, file associations, shortcuts and stale
    // taskbar pin. User settings live separately under %APPDATA%\app.solomd.
    let Ok(status) = Command::new(legacy_uninstaller).arg("/S").status() else {
        return;
    };
    if status.success() {
        unsafe {
            windows_sys::Win32::UI::Shell::SHChangeNotify(
                windows_sys::Win32::UI::Shell::SHCNE_ASSOCCHANGED as i32,
                windows_sys::Win32::UI::Shell::SHCNF_IDLIST,
                std::ptr::null(),
                std::ptr::null(),
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn migrate_legacy_nsis_install() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_the_official_msi_and_legacy_nsis_paths() {
        assert!(is_expected_install_layout(
            r"C:\Program Files\SoloMD\SoloMD.exe",
            r"C:\Program Files",
            r#""C:\Users\alex\AppData\Local\SoloMD""#,
            r"C:\Users\alex\AppData\Local",
        ));
    }

    #[test]
    fn rejects_portable_or_unrelated_directories() {
        assert!(!is_expected_install_layout(
            r"D:\Portable\SoloMD.exe",
            r"C:\Program Files",
            r"C:\Users\alex\AppData\Local\SoloMD",
            r"C:\Users\alex\AppData\Local",
        ));
        assert!(!is_expected_install_layout(
            r"C:\Program Files\SoloMD\SoloMD.exe",
            r"C:\Program Files",
            r"C:\Users\alex\AppData\Local\OtherApp",
            r"C:\Users\alex\AppData\Local",
        ));
    }
}
