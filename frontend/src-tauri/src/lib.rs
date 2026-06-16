use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow, Window, WindowEvent};

const WINDOW_STATE_FILE: &str = "window-state.json";

#[derive(Debug, Serialize, Deserialize)]
struct StoredWindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    fullscreen: bool,
    maximized: bool,
}

#[derive(Debug, Serialize)]
struct WindowInfo {
    label: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    fullscreen: bool,
    always_on_top: bool,
    maximized: bool,
    minimized: bool,
    scale_factor: f64,
}

#[tauri::command]
fn health_check() -> Result<String, String> {
    let resp = std::process::Command::new("curl")
        .args([
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "http://localhost:47778/api/health",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let status = String::from_utf8_lossy(&resp.stdout).to_string();
    Ok(status)
}

#[tauri::command]
fn get_backend_url() -> String {
    "http://localhost:47778".to_string()
}

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let next = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn set_always_on_top(window: WebviewWindow, on: bool) -> Result<bool, String> {
    window.set_always_on_top(on).map_err(|e| e.to_string())?;
    Ok(on)
}

#[tauri::command]
fn get_window_info(window: WebviewWindow) -> Result<WindowInfo, String> {
    webview_window_info(&window)
}

fn webview_window_info<R: Runtime>(window: &WebviewWindow<R>) -> Result<WindowInfo, String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    Ok(WindowInfo {
        label: window.label().to_string(),
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        fullscreen: window.is_fullscreen().map_err(|e| e.to_string())?,
        always_on_top: window.is_always_on_top().map_err(|e| e.to_string())?,
        maximized: window.is_maximized().map_err(|e| e.to_string())?,
        minimized: window.is_minimized().map_err(|e| e.to_string())?,
        scale_factor: window.scale_factor().map_err(|e| e.to_string())?,
    })
}

fn stored_window_state<R: Runtime>(window: &Window<R>) -> Result<StoredWindowState, String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    Ok(StoredWindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        fullscreen: window.is_fullscreen().map_err(|e| e.to_string())?,
        maximized: window.is_maximized().map_err(|e| e.to_string())?,
    })
}

fn window_state_path<R: Runtime, M: Manager<R>>(manager: &M) -> Result<PathBuf, String> {
    let dir = manager.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(WINDOW_STATE_FILE))
}

fn save_window_state<R: Runtime>(window: &Window<R>) -> Result<(), String> {
    let state = stored_window_state(window)?;
    let path = window_state_path(window)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn restore_window_state<R: Runtime, M: Manager<R>>(
    manager: &M,
    window: &WebviewWindow<R>,
) -> Result<(), String> {
    let path = window_state_path(manager)?;
    if !path.exists() {
        return Ok(());
    }
    let json = fs::read(path).map_err(|e| e.to_string())?;
    let state: StoredWindowState = serde_json::from_slice(&json).map_err(|e| e.to_string())?;
    if !state.fullscreen && !state.maximized {
        window
            .set_size(PhysicalSize::new(state.width, state.height))
            .map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition::new(state.x, state.y))
            .map_err(|e| e.to_string())?;
    }
    if state.maximized {
        window.maximize().map_err(|e| e.to_string())?;
    }
    if state.fullscreen {
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            get_backend_url,
            toggle_fullscreen,
            set_always_on_top,
            get_window_info
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                if let Err(e) = save_window_state(window) {
                    eprintln!("failed to save window state: {e}");
                }
            }
        })
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_title("ARRA Oracle").unwrap();
            if let Err(e) = restore_window_state(app, &window) {
                eprintln!("failed to restore window state: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
