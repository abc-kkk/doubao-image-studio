use std::io::Cursor;
use std::sync::Arc;
use tauri::{Manager, State};
use serde_json::json;

mod services;

use services::{DbService, HttpService};

// ============================================================================
// Tauri State
// ============================================================================

pub struct AppState {
    pub db: Arc<DbService>,
    pub http: Arc<HttpService>,
}

// ============================================================================
// Database Commands
// ============================================================================

#[tauri::command]
async fn get_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<serde_json::Value, String> {
    let limit = limit.unwrap_or(200);
    let offset = offset.unwrap_or(0);
    
    let images = state.db.get_images(limit, offset)?;
    let result: Vec<serde_json::Value> = images.into_iter().map(|img| {
        json!({
            "success": true,
            "id": img.id,
            "batchId": img.batch_id,
            "prompt": img.prompt,
            "model": img.model,
            "aspectRatio": img.aspect_ratio,
            "localPath": img.local_path,
            "url": img.url,
            "createdAt": img.created_at,
            "status": img.status,
        })
    }).collect();
    
    Ok(json!({ "success": true, "history": result }))
}

#[tauri::command]
async fn save_history(state: State<'_, AppState>, image: serde_json::Value) -> Result<(), String> {
    let record = services::ImageRecord {
        id: image.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        batch_id: image.get("batchId").and_then(|v| v.as_str()).map(String::from),
        prompt: image.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        model: image.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        aspect_ratio: image.get("aspectRatio").and_then(|v| v.as_str()).map(String::from),
        local_path: image.get("localPath").and_then(|v| v.as_str()).map(String::from),
        url: image.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        created_at: image.get("createdAt").and_then(|v| v.as_i64()).unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64
        }),
        status: image.get("status").and_then(|v| v.as_str()).unwrap_or("success").to_string(),
    };
    
    state.db.save_image(&record)
}

#[tauri::command]
async fn delete_history(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_image(&id)
}

#[tauri::command]
async fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    state.db.clear_all()
}

// ============================================================================
// Health & Status Commands
// ============================================================================

#[tauri::command]
async fn get_server_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let connections = state.http.get_connections();
    let pending = state.http.get_pending_requests();
    let models = state.http.get_connection_models();

    // Collect all registered models
    let registered_models: Vec<String> = models.read().await.values()
        .flatten()
        .cloned()
        .collect();

    Ok(json!({
        "status": "running",
        "version": "3.0.0-rust",
        "features": ["rusqlite", "tokio-ws", "http-api"],
        "connections": connections.read().await.len(),
        "pendingTasks": pending.read().await.len(),
        "registeredModels": registered_models,
        "timestamp": chrono_timestamp(),
    }))
}

#[tauri::command]
async fn get_progress(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let pending = state.http.get_pending_requests();
    
    Ok(json!({ 
        "text": "", 
        "active": !pending.read().await.is_empty() 
    }))
}

// ============================================================================
// Image Generation Commands (Proxy to Workers via HTTP)
// ============================================================================

#[tauri::command]
async fn check_worker(url: String) -> Result<bool, String> {
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
                return Ok(models > 0);
            }
            Ok(false)
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
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

// ============================================================================
// File Commands
// ============================================================================

#[tauri::command]
async fn download_image(
    url: String, 
    filename: String, 
    save_dir: Option<String>
) -> Result<String, String> {
    println!("[AI Studio] Downloading image from: {}", url);
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Server returned status: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let download_path = if let Some(dir) = save_dir {
        if dir.is_empty() {
            get_default_download_dir()?
        } else {
            std::path::PathBuf::from(dir)
        }
    } else {
        get_default_download_dir()?
    };

    // Ensure directory exists
    if !download_path.exists() {
        std::fs::create_dir_all(&download_path).map_err(|e| e.to_string())?;
    }

    let file_path = download_path.join(&filename);
    std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    println!("[AI Studio] Download successful: {:?}", file_path);
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn save_history_image(
    app: tauri::AppHandle,
    url: String, 
    id: String, 
    save_dir: Option<String>
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
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

// ============================================================================
// Image Compression (Rust-native)
// ============================================================================

#[tauri::command]
async fn compress_image(
    image_data: String,
    format: String,
    quality: u8,
    target_size: Option<usize>,
) -> Result<String, String> {
    use image::ImageReader;
    
    // Decode base64 image
    let image_data = if image_data.starts_with("data:") {
        let parts: Vec<&str> = image_data.split(',').collect();
        if parts.len() < 2 {
            return Err("Invalid base64 image format".to_string());
        }
        parts[1]
    } else {
        &image_data
    };

    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        image_data
    ).map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Load image
    let img = ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|e| format!("Failed to guess format: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let target_size = target_size.unwrap_or(1024 * 1024);
    let fmt = format.to_lowercase();
    let q = quality.min(100) as f32;

    // Try encoding with current quality
    let mut result = encode_image(&img, &fmt, q)?;
    
    // If too large and not PNG, try lower quality
    if result.len() > target_size && fmt != "png" {
        let mut current_q = q;
        while result.len() > target_size && current_q > 20.0 {
            current_q -= 10.0;
            result = encode_image(&img, &fmt, current_q.max(20.0))?;
        }
    }
    
    // If still too large, resize
    if result.len() > target_size {
        let mut work_img = img.clone();
        let mut width = work_img.width();
        let mut height = work_img.height();
        
        while result.len() > target_size && width > 200 && height > 200 {
            width = (width as f32 * 0.8) as u32;
            height = (height as f32 * 0.8) as u32;
            work_img = work_img.resize(width, height, image::imageops::FilterType::Lanczos3);
            result = encode_image(&work_img, &fmt, q.max(30.0))?;
        }
    }

    let b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &result
    );
    let mime = format!("image/{}", fmt.replace("jpg", "jpeg"));
    
    Ok(format!("data:{};base64,{}", mime, b64))
}

fn encode_image(img: &image::DynamicImage, fmt: &str, quality: f32) -> Result<Vec<u8>, String> {
    use image::ImageFormat;
    let q = quality as u8;
    
    match fmt {
        "png" => {
            let mut buf = Vec::new();
            let mut cursor = Cursor::new(&mut buf);
            img.write_to(&mut cursor, ImageFormat::Png)
                .map_err(|e| format!("PNG encode error: {}", e))?;
            Ok(buf)
        }
        "webp" => {
            let mut buf = Vec::new();
            let mut cursor = Cursor::new(&mut buf);
            img.write_to(&mut cursor, ImageFormat::WebP)
                .map_err(|e| format!("WebP encode error: {}", e))?;
            Ok(buf)
        }
        _ => {
            let mut buf = Vec::new();
            let mut cursor = Cursor::new(&mut buf);
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, q);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("JPEG encode error: {}", e))?;
            Ok(buf)
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn chrono_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    
    let millis = now % 1000;
    format!("1970-01-01T00:00:00.{:03}Z", millis)
}

fn get_default_download_dir() -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
        Ok(std::path::PathBuf::from(home).join("Downloads"))
    }
    #[cfg(target_os = "windows")]
    {
        let home = std::env::var("USERPROFILE").map_err(|_| "Could not find USERPROFILE directory".to_string())?;
        Ok(std::path::PathBuf::from(home).join("Downloads"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::current_dir().map_err(|e| e.to_string())
    }
}

// ============================================================================
// Application Entry Point
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize services
    let db = Arc::new(DbService::new());
    let http = Arc::new(HttpService::new(db.clone()));
    
    let db_clone = db.clone();
    let http_clone = http.clone();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(move |app| {
            // Initialize database
            if let Err(e) = db_clone.init(&app.handle()) {
                eprintln!("[AI Studio] Database initialization failed: {}", e);
            }
            
            // Start HTTP/WebSocket server on port 8081 in background
            let http_clone_bg = http_clone.clone();
            
            // Create a new Tokio runtime for HTTP server
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async move {
                    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                    if let Err(e) = http_clone_bg.start(8081).await {
                        eprintln!("[AI Studio] HTTP server failed: {}", e);
                    }
                    // Keep the runtime alive
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
                    }
                });
            });
            
            println!("[AI Studio] All services initialized");
            Ok(())
        })
        .manage(AppState { db, http })
        .invoke_handler(tauri::generate_handler![
            // Database commands
            get_history,
            save_history,
            delete_history,
            clear_history,
            // Status commands
            get_server_status,
            get_progress,
            // HTTP proxy commands
            check_worker,
            fetch_text,
            generate_image_request,
            // File commands
            download_image,
            save_history_image,
            delete_file,
            clear_history_images,
            // Image processing
            compress_image,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                println!("[AI Studio] Window closed, shutting down services...");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
