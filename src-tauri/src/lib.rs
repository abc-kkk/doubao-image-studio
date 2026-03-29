use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::Manager;

struct ServerProcess(Arc<Mutex<Option<std::process::Child>>>);

#[tauri::command]
fn get_server_status(state: tauri::State<ServerProcess>) -> bool {
    let guard = state.0.lock().unwrap();
    guard.is_some()
}

#[tauri::command]
async fn check_worker(url: String) -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();
    match client.get(&url).send().await {
        Ok(res) => {
            if let Ok(data) = res.json::<serde_json::Value>().await {
                let models = data.get("registeredModels")
                    .and_then(|v| v.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                return models > 0;
            }
            false
        }
        Err(_) => false,
    }
}

#[tauri::command]
async fn generate_image_request(url: String, body: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(240))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
async fn download_image(url: String, filename: String, save_dir: Option<String>) -> Result<String, String> {
    println!("[AI Studio] Downloading image from: {}", url);
    println!("[AI Studio] Save directory: {:?}", save_dir);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| {
        let err = format!("Failed to send request: {}", e);
        eprintln!("[AI Studio] {}", err);
        err
    })?;

    if !response.status().is_success() {
        let err = format!("Server returned status: {}", response.status());
        eprintln!("[AI Studio] {}", err);
        return Err(err);
    }

    let bytes = response.bytes().await.map_err(|e| {
        let err = format!("Failed to read bytes: {}", e);
        eprintln!("[AI Studio] {}", err);
        err
    })?;

    let download_path = if let Some(dir) = save_dir {
        if dir.is_empty() {
            get_default_download_dir()?
        } else {
            std::path::PathBuf::from(dir)
        }
    } else {
        get_default_download_dir()?
    };

    println!("[AI Studio] Final download path: {:?}", download_path);

    // Ensure directory exists
    if !download_path.exists() {
        std::fs::create_dir_all(&download_path).map_err(|e| {
            let err = format!("Failed to create directory: {}", e);
            eprintln!("[AI Studio] {}", err);
            err
        })?;
    }

    let file_path = download_path.join(filename);
    std::fs::write(&file_path, bytes).map_err(|e| {
        let err = format!("Failed to write file: {}", e);
        eprintln!("[AI Studio] {}", err);
        err
    })?;

    println!("[AI Studio] Download successful: {:?}", file_path);
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn save_history_image(app: tauri::AppHandle, url: String, id: String, save_dir: Option<String>) -> Result<String, String> {
    println!("[AI Studio] Saving history image: {} ({}) to {:?}", id, url, save_dir);
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let history_dir = if let Some(dir) = save_dir {
        if dir.is_empty() {
            let data_dir = app.path().app_local_data_dir().map_err(|e: tauri::Error| e.to_string())?;
            data_dir.join("history")
        } else {
            std::path::PathBuf::from(dir)
        }
    } else {
        let data_dir = app.path().app_local_data_dir().map_err(|e: tauri::Error| e.to_string())?;
        data_dir.join("history")
    };

    if !history_dir.exists() {
        std::fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;
    }

    let file_path = history_dir.join(format!("{}.png", id));
    std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn clear_history_images(app: tauri::AppHandle, save_dir: Option<String>) -> Result<(), String> {
    let history_dir = if let Some(dir) = save_dir {
        if dir.is_empty() {
            let data_dir = app.path().app_local_data_dir().map_err(|e: tauri::Error| e.to_string())?;
            data_dir.join("history")
        } else {
            std::path::PathBuf::from(dir)
        }
    } else {
        let data_dir = app.path().app_local_data_dir().map_err(|e: tauri::Error| e.to_string())?;
        data_dir.join("history")
    };

    if history_dir.exists() {
        std::fs::remove_dir_all(&history_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn get_default_download_dir() -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
        Ok(std::path::PathBuf::from(home).join("Downloads"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Fallback or other OS support
        std::env::current_dir().map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Find node executable
    let node_path = which_node();
    let server_dir = find_server_dir();

    // If port 8081 is already in use, skip starting the server
    let port_in_use = std::net::TcpStream::connect("127.0.0.1:8081").is_ok();

    let child = if port_in_use {
        println!("[AI Studio] Port 8081 already in use, skipping server start");
        None
    } else if let (Some(node), Some(dir)) = (node_path, server_dir) {
        match Command::new(&node)
            .arg("src/app.js")
            .current_dir(&dir)
            .env("PORT", "8081")
            .spawn()
        {
            Ok(c) => {
                println!("[AI Studio] Express server started (pid: {})", c.id());
                Some(c)
            }
            Err(e) => {
                eprintln!("[AI Studio] Failed to start server: {}", e);
                None
            }
        }
    } else {
        eprintln!("[AI Studio] Node.js or server directory not found");
        None
    };

    let server_state = ServerProcess(Arc::new(Mutex::new(child)));
    let state_clone = server_state.0.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .manage(server_state)
        .invoke_handler(tauri::generate_handler![
            get_server_status, 
            check_worker, 
            generate_image_request, 
            download_image,
            save_history_image,
            delete_file,
            clear_history_images
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let mut guard = state_clone.lock().unwrap();
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    println!("[AI Studio] Express server stopped");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn which_node() -> Option<String> {
    // Common node paths on macOS
    let candidates = [
        "/usr/local/opt/node@22/bin/node",
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "node",
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() || path == &"node" {
            return Some(path.to_string());
        }
    }
    None
}

fn find_server_dir() -> Option<String> {
    // Try relative to the app's resource dir, or next to the binary
    let exe = std::env::current_exe().ok()?;
    let app_dir = exe.parent()?;

    let candidates = [
        app_dir.join("../Resources/server"),
        app_dir.join("server"),
        // Dev mode: look for the original doubao-pro project
        std::path::PathBuf::from("/Users/ios/Desktop/lx-home/doubao-tauri/server"),
    ];

    for path in &candidates {
        if path.join("src/app.js").exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }
    None
}
