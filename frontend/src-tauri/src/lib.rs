use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, State, WebviewWindow, Window,
    WindowEvent,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const BACKEND_URL: &str = "http://localhost:47778";
const HEALTH_URL: &str = "http://localhost:47778/api/health";
const WINDOW_STATE_FILE: &str = "window-state.json";

#[derive(Clone, Default)]
struct BackendState {
    child: Arc<Mutex<Option<CommandChild>>>,
}

#[derive(Debug, Serialize, Deserialize)]
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

fn project_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .and_then(|frontend| frontend.parent())
        .map(PathBuf::from)
        .ok_or_else(|| "failed to resolve project root".to_string())
}

#[tauri::command]
fn start_backend(app: AppHandle, state: State<BackendState>) -> Result<String, String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "backend state lock poisoned".to_string())?;
    if let Some(child) = guard.as_ref() {
        return Ok(format!(
            "backend already running at {BACKEND_URL} (pid {})",
            child.pid()
        ));
    }

    let (mut events, child) = app
        .shell()
        .command("bun")
        .args(["run", "server"])
        .current_dir(project_root()?)
        .spawn()
        .map_err(|e| format!("failed to start backend: {e}"))?;
    let pid = child.pid();
    *guard = Some(child);

    let state_for_task = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if matches!(event, CommandEvent::Terminated(_) | CommandEvent::Error(_)) {
                if let Ok(mut child) = state_for_task.child.lock() {
                    if child.as_ref().is_some_and(|current| current.pid() == pid) {
                        *child = None;
                    }
                }
                break;
            }
        }
    });

    Ok(format!("backend started at {BACKEND_URL} (pid {pid})"))
}

#[tauri::command]
fn stop_backend(state: State<BackendState>) -> Result<String, String> {
    let child = state
        .child
        .lock()
        .map_err(|_| "backend state lock poisoned".to_string())?
        .take();

    match child {
        Some(child) => {
            let pid = child.pid();
            child
                .kill()
                .map_err(|e| format!("failed to stop backend: {e}"))?;
            Ok(format!("backend stopped (pid {pid})"))
        }
        None => Ok("backend not running".to_string()),
    }
}

#[tauri::command]
fn health_check() -> Result<String, String> {
    let resp = std::process::Command::new("curl")
        .args(["-s", "-o", "/dev/null", "-w", "%{http_code}", HEALTH_URL])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&resp.stdout).to_string())
}

#[tauri::command]
fn get_backend_url() -> String {
    BACKEND_URL.to_string()
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

fn stored_window_state<R: Runtime>(window: &Window<R>) -> Result<WindowInfo, String> {
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

fn window_state_path<R: Runtime, M: Manager<R>>(manager: &M) -> Result<PathBuf, String> {
    manager
        .path()
        .app_data_dir()
        .map(|dir| dir.join(WINDOW_STATE_FILE))
        .map_err(|e| e.to_string())
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

fn restore_state<R: Runtime, M: Manager<R>>(
    manager: &M,
    window: &WebviewWindow<R>,
) -> Result<(), String> {
    let path = window_state_path(manager)?;
    if !path.exists() {
        return Ok(());
    }
    let state: WindowInfo = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
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
    window
        .set_fullscreen(state.fullscreen)
        .map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            get_backend_url,
            start_backend,
            stop_backend,
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
            if let Err(e) = restore_state(app, &window) {
                eprintln!("failed to restore window state: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
