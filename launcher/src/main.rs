#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod process;
mod supervisor;

use std::io::{BufRead, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use supervisor::{Controller, Options, Snapshot};
use tauri::Manager;

#[tauri::command]
fn get_snapshot(controller: tauri::State<'_, Arc<Controller>>) -> Snapshot {
    controller.snapshot()
}

#[tauri::command]
fn start_server(
    controller: tauri::State<'_, Arc<Controller>>,
    options: Options,
) -> Result<(), String> {
    controller.start(options)
}

#[tauri::command]
fn stop_server(controller: tauri::State<'_, Arc<Controller>>) -> Result<(), String> {
    controller.stop()
}

fn open(controller: &Controller) -> Result<(), String> {
    let snapshot = controller.snapshot();
    if !matches!(snapshot.phase.as_str(), "running" | "external") {
        return Err("Attendre que Fitness soit prêt avant de l'ouvrir.".into());
    }
    process::hidden(
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", &snapshot.url]),
    )
    .spawn()
    .map(|_| ())
    .map_err(|e| format!("Ouverture du navigateur impossible : {e}"))
}

#[tauri::command]
fn open_app(controller: tauri::State<'_, Arc<Controller>>) -> Result<(), String> {
    open(&controller)
}

// Même supervision, sans WebView : contrôle fonctionnel et développement Chrome.
// Aucun serveur HTTP de contrôle n'est inclus dans l'exécutable.
fn diagnostic(controller: &Controller) {
    let mut stdout = std::io::stdout().lock();
    for line in std::io::stdin().lock().lines() {
        let result = line.map_err(|e| e.to_string()).and_then(|line| {
            let request: serde_json::Value =
                serde_json::from_str(&line).map_err(|e| e.to_string())?;
            match request["command"].as_str() {
                Some("get_snapshot") => {
                    serde_json::to_value(controller.snapshot()).map_err(|e| e.to_string())
                }
                Some("start_server") => controller
                    .start(
                        serde_json::from_value(request["options"].clone())
                            .map_err(|e| e.to_string())?,
                    )
                    .map(|_| serde_json::Value::Null),
                Some("stop_server") => controller.stop().map(|_| serde_json::Value::Null),
                Some("open_app") => open(controller).map(|_| serde_json::Value::Null),
                _ => Err("Commande de diagnostic inconnue.".into()),
            }
        });
        let response = match result {
            Ok(value) => serde_json::json!({"ok": value}),
            Err(error) => serde_json::json!({"error": error}),
        };
        if writeln!(stdout, "{response}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
    }
    controller.shutdown();
}

fn main() {
    let root = match supervisor::project_root() {
        Ok(root) => root,
        Err(error) => {
            startup_error(&error);
            return;
        }
    };
    let port = match std::env::var("FITNESS_LAUNCHER_PORT")
        .map_or(Ok(4330), |value| value.parse::<u16>())
    {
        Ok(port) if port > 0 => port,
        _ => {
            startup_error("FITNESS_LAUNCHER_PORT doit être un port valide (1–65535).");
            return;
        }
    };
    let controller = Arc::new(Controller::new(root, port));
    if std::env::args().any(|arg| arg == "--diagnostic") {
        diagnostic(&controller);
        return;
    }
    let closing = Arc::new(AtomicBool::new(false));
    let close_controller = controller.clone();
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(controller.clone())
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            start_server,
            stop_server,
            open_app
        ])
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if !closing.swap(true, Ordering::SeqCst) {
                    let controller = close_controller.clone();
                    let app = window.app_handle().clone();
                    std::thread::spawn(move || {
                        controller.shutdown();
                        app.exit(0);
                    });
                }
            }
        })
        .run(tauri::generate_context!());
    controller.shutdown();
    if let Err(error) = result {
        startup_error(&format!("Impossible d'ouvrir le lanceur Fitness : {error}"));
    }
}

fn startup_error(error: &str) {
    eprintln!("{error}");
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let message: Vec<u16> = error.encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "Fitness · Lanceur".encode_utf16().chain(Some(0)).collect();
        // SAFETY: chaînes UTF-16 terminées, valides pendant l'appel synchrone.
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                message.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }
}
