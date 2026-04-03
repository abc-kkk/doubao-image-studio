use tauri::Manager;

mod server;

use server::{start_server, Db};

#[tauri::command]
fn get_server_status() -> Result<String, String> {
    Ok(format!("Server running on port {}", find_port()))
}

#[tauri::command]
async fn check_worker(_url: String) -> bool {
    true
}

#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    res.text().await.map_err(|e| e.to_string())
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
    res.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_image(
    url: String,
    filename: String,
    save_dir: Option<String>,
) -> Result<String, String> {
    println!("[AI Studio] Downloading image from: {}", url);
    println!("[AI Studio] Save directory: {:?}", save_dir);

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
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
async fn save_history_image(
    app: tauri::AppHandle,
    url: String,
    id: String,
    save_dir: Option<String>,
) -> Result<String, String> {
    println!(
        "[AI Studio] Saving history image: {} ({}) to {:?}",
        id, url, save_dir
    );

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let history_dir = if let Some(dir) = save_dir {
        if dir.is_empty() {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|e: tauri::Error| e.to_string())?;
            data_dir.join("history")
        } else {
            std::path::PathBuf::from(dir)
        }
    } else {
        let data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|e: tauri::Error| e.to_string())?;
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
fn clear_history_images(
    app: tauri::AppHandle,
    save_dir: Option<String>,
) -> Result<(), String> {
    let history_dir = if let Some(dir) = save_dir {
        if dir.is_empty() {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|e: tauri::Error| e.to_string())?;
            data_dir.join("history")
        } else {
            std::path::PathBuf::from(dir)
        }
    } else {
        let data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|e: tauri::Error| e.to_string())?;
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
        let home =
            std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
        Ok(std::path::PathBuf::from(home).join("Downloads"))
    }
    #[cfg(target_os = "windows")]
    {
        let home = std::env::var("USERPROFILE")
            .map_err(|_| "Could not find USERPROFILE directory".to_string())?;
        Ok(std::path::PathBuf::from(home).join("Downloads"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::current_dir().map_err(|e| e.to_string())
    }
}

fn find_db_path() -> std::path::PathBuf {
    // Use system-appropriate app data directory
    let data_dir = if let Some(dir) = dirs::data_local_dir() {
        dir.join("doubao-assistant")
    } else if let Some(dir) = dirs::data_dir() {
        dir.join("doubao-assistant")
    } else {
        std::path::PathBuf::from("/tmp/doubao-assistant")
    };

    // Ensure directory exists
    if !data_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&data_dir) {
            eprintln!("⚠️ Failed to create data dir {:?}: {}", data_dir, e);
        }
    }

    data_dir.join("metadata.db")
}

fn find_port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8081)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = find_db_path();
    let port = find_port();

    // Initialize database
    let db = match Db::new(&db_path) {
        Ok(db) => {
            println!("📦 Database initialized at: {:?}", db_path);
            db
        }
        Err(e) => {
            eprintln!("❌ Failed to open database: {e}");
            std::process::exit(1);
        }
    };

    // Spawn server in a background thread with its own Tokio runtime
    let server_port = port;
    let server_handle = std::thread::Builder::new()
        .name("rust-server".to_string())
        .spawn(move || {
            println!("[AI Studio] Starting Rust server on port {}...", server_port);
            let rt = match tokio::runtime::Runtime::new() {
                Ok(rt) => rt,
                Err(e) => {
                    eprintln!("❌ Failed to create tokio runtime: {e}");
                    return;
                }
            };
            if let Err(e) = rt.block_on(start_server(server_port, db)) {
                eprintln!("❌ Server error: {e}");
            }
            println!("[AI Studio] Rust server thread exiting");
        });

    if let Err(e) = server_handle {
        eprintln!("❌ Failed to spawn server thread: {e}");
    } else {
        println!("[AI Studio] Server thread started successfully");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            check_worker,
            fetch_text,
            generate_image_request,
            download_image,
            save_history_image,
            delete_file,
            clear_history_images
        ])
        .setup(move |app| {
            println!("[AI Studio] Tauri app setup complete");
            println!("[AI Studio] Main window created, waiting for server...");
            // Keep a reference to the app handle to prevent lifetime issues
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
