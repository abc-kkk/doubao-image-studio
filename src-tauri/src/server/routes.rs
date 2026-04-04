//! REST API routes

use axum::{
    extract::{Query, State, WebSocketUpgrade},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Router,
};
use futures_util::SinkExt;
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::PathBuf;

use super::{db::ImageRecord, websocket, AppState};

/// Create the main application router
pub fn create_app(state: AppState) -> Router {
    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    Router::new()
        .route("/api/health", get(health))
        .route("/api/history", get(get_history).post(save_history).delete(clear_history))
        .route("/api/history/{id}", delete(delete_history))
        .route("/api/compress", post(compress_image))
        .route("/api/images/generate", post(generate_image))
        .route("/local-proxy", get(local_proxy))
        .route("/ws", get(ws_handler))
        .route("/config.json", get(config_json))
        .layer(cors)
        .with_state(state)
}

/// WebSocket handler wrapper
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    websocket::ws_handler(ws, state.ws_clients).await
}

// === Health Check ===

async fn health(State(state): State<AppState>) -> axum::Json<serde_json::Value> {
    let clients = state.ws_clients.read().await;
    axum::Json(serde_json::json!({
        "status": "running",
        "version": "2.0.5-rust",
        "features": ["local-proxy", "image-resize"],
        "legacyConnected": clients.legacy.is_some(),
        "registeredModels": clients.models.keys().collect::<Vec<_>>(),
        "timestamp": unix_timestamp(),
    }))
}

// === History API ===

async fn get_history(State(state): State<AppState>) -> Result<axum::Json<serde_json::Value>, StatusCode> {
    match state.db.get_images(200) {
        Ok(images) => Ok(axum::Json(serde_json::json!({ "success": true, "history": images }))),
        Err(_) => Err(http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn save_history(State(state): State<AppState>, axum::Json(image): axum::Json<ImageRecord>) -> Result<axum::Json<serde_json::Value>, StatusCode> {
    match state.db.save_image(&image) {
        Ok(()) => Ok(axum::Json(serde_json::json!({ "success": true }))),
        Err(_) => Err(http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn delete_history(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<axum::Json<serde_json::Value>, StatusCode> {
    match state.db.delete_image(&id) {
        Ok(()) => Ok(axum::Json(serde_json::json!({ "success": true }))),
        Err(_) => Err(http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn clear_history(State(state): State<AppState>) -> Result<axum::Json<serde_json::Value>, StatusCode> {
    match state.db.clear_all() {
        Ok(()) => Ok(axum::Json(serde_json::json!({ "success": true }))),
        Err(_) => Err(http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

// === Image Generation ===

use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct GenerateRequest {
    model: Option<String>,
    prompt: String,
    aspect_ratio: Option<String>,
    reference_images: Option<Vec<String>>,
    switch_to_image_mode: Option<bool>,
}

#[derive(Debug, Serialize)]
struct GenerateResponse {
    success: bool,
    images: Vec<ImageResult>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct ImageResult {
    url: String,
    thumbnail_url: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

async fn generate_image(
    State(state): State<AppState>,
    axum::Json(req): axum::Json<GenerateRequest>,
) -> Response {
    let request_id = Uuid::new_v4().to_string();
    let model = req.model.as_deref().unwrap_or("doubao-pro-image");
    let aspect_ratio = req.aspect_ratio.as_deref().unwrap_or("1:1");
    let reference_images = req.reference_images.unwrap_or_default();
    let switch_to_image_mode = req.switch_to_image_mode.unwrap_or(false);

    // Create contents array
    let contents = vec![serde_json::json!({ "text": req.prompt })];

    // Send GENERATE message to Chrome extension via WebSocket
    let ws_msg = serde_json::json!({
        "type": "GENERATE",
        "request_id": request_id,
        "model": model,
        "contents": contents,
        "aspect_ratio": aspect_ratio,
        "reference_images_b64": reference_images,
        "switch_to_image_mode": switch_to_image_mode
    });

    // Try to send to Chrome extension
    let clients = state.ws_clients.read().await;
    if let Some(ref write) = clients.legacy {
        let write = write.clone();
        let msg_str = serde_json::to_string(&ws_msg).unwrap_or_default();
        let send_result = tokio::spawn(async move {
            let mut write_guard = write.lock().await;
            write_guard.send(axum::extract::ws::Message::Text(axum::extract::ws::Utf8Bytes::from(msg_str))).await
        }).await;

        if send_result.is_err() || send_result.unwrap().is_err() {
            let response = GenerateResponse {
                success: false,
                images: vec![],
                error: Some("Failed to send request to Chrome extension".to_string()),
            };
            return (http::StatusCode::INTERNAL_SERVER_ERROR, axum::Json(response)).into_response();
        }
    } else {
        // No Chrome extension connected
        let response = GenerateResponse {
            success: false,
            images: vec![],
            error: Some("Chrome extension not connected. Please ensure the extension is running.".to_string()),
        };
        return (http::StatusCode::SERVICE_UNAVAILABLE, axum::Json(response)).into_response();
    }
    drop(clients);

    // For now, return a success indicating the request was sent
    // The actual response will come via WebSocket and should be handled by the frontend
    let response = GenerateResponse {
        success: true,
        images: vec![],
        error: Some("Request sent to Chrome extension. Waiting for response...".to_string()),
    };
    axum::Json(response).into_response()
}

// === Image Compression ===

#[derive(Debug, Deserialize)]
struct CompressRequest {
    image: String,
    format: Option<String>,
    quality: Option<u8>,
    target_size: Option<usize>,
}

#[derive(Serialize)]
struct CompressResponse {
    success: bool,
    data_url: Option<String>,
    orig_size: usize,
    comp_size: usize,
    width: u32,
    height: u32,
    format: String,
    error: Option<String>,
}

async fn compress_image(axum::Json(req): axum::Json<CompressRequest>) -> Response {
    // Decode image
    let buffer = match decode_image(&req.image) {
        Ok(b) => b,
        Err(e) => {
            return axum::Json(CompressResponse {
                success: false,
                data_url: None,
                orig_size: 0,
                comp_size: 0,
                width: 0,
                height: 0,
                format: String::new(),
                error: Some(e),
            })
            .into_response();
        }
    };

    let orig_size = buffer.len();
    let fmt = req.format.as_deref().unwrap_or("jpeg");
    let quality = req.quality.unwrap_or(80);
    let target_size = req.target_size.unwrap_or(1024 * 1024);

    // Load image for dimensions
    let img = match image::load_from_memory(&buffer) {
        Ok(i) => i,
        Err(e) => {
            return axum::Json(CompressResponse {
                success: false,
                data_url: None,
                orig_size,
                comp_size: 0,
                width: 0,
                height: 0,
                format: fmt.to_string(),
                error: Some(format!("Failed to decode image: {e}")),
            })
            .into_response();
        }
    };

    let (width, height) = img.dimensions();
    let mut current_width = width;
    let mut current_height = height;

    // Compress iteratively
    let mut result_buffer: Vec<u8>;
    let mut q = quality;

    loop {
        result_buffer = encode_image(&img, fmt, q);

        if result_buffer.len() <= target_size || q <= 20 || fmt == "png" {
            break;
        }
        q = q.saturating_sub(10).max(20);
    }

    // If still too large, resize
    let mut resized_img = img.clone();
    while result_buffer.len() > target_size {
        if current_width <= 200 || current_height <= 200 {
            break;
        }
        current_width = (current_width as f32 * 0.8) as u32;
        current_height = (current_height as f32 * 0.8) as u32;
        resized_img = img.resize(current_width, current_height, image::imageops::FilterType::Lanczos3);
        result_buffer = encode_image(&resized_img, fmt, q.max(30));
    }

    let comp_size = result_buffer.len();
    let mime = if fmt == "png" { "image/png" } else { "image/jpeg" };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&result_buffer);
    let data_url = format!("data:{mime};base64,{b64}");

    axum::Json(CompressResponse {
        success: true,
        data_url: Some(data_url),
        orig_size,
        comp_size,
        width: current_width,
        height: current_height,
        format: fmt.to_string(),
        error: None,
    })
    .into_response()
}

fn decode_image(image_str: &str) -> Result<Vec<u8>, String> {
    if image_str.starts_with("data:") {
        let parts: Vec<&str> = image_str.splitn(2, ',').collect();
        if parts.len() != 2 {
            return Err("Invalid data URL".to_string());
        }
        base64::engine::general_purpose::STANDARD
            .decode(parts[1])
            .map_err(|e| e.to_string())
    } else if image_str.starts_with("/Users/")
        || image_str.starts_with("C:\\")
        || image_str.starts_with("/")
    {
        std::fs::read(image_str).map_err(|e| format!("Failed to read file: {e}"))
    } else {
        Err("Unsupported image format".to_string())
    }
}

fn encode_image(img: &image::DynamicImage, format: &str, quality: u8) -> Vec<u8> {
    match format {
        "png" => {
            let mut buf = Vec::new();
            img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
                .unwrap_or_default();
            buf
        }
        "webp" => {
            let mut buf = Vec::new();
            img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
                .unwrap_or_default();
            buf
        }
        _ => {
            let mut buf = Vec::new();
            let mut encoder = JpegEncoder::new_with_quality(&mut buf, quality);
            let rgba = img.to_rgba8();
            let (width, height) = rgba.dimensions();
            encoder
                .encode(rgba.as_raw(), width, height, image::ExtendedColorType::Rgba8)
                .unwrap_or_default();
            buf
        }
    }
}

// === Local Proxy ===

#[derive(Debug, Deserialize)]
struct ProxyQuery {
    path: String,
    w: Option<u32>,
    h: Option<u32>,
}

async fn local_proxy(Query(query): Query<ProxyQuery>) -> Response {
    let file_path = PathBuf::from(&query.path);

    // Security: Only allow files from user's home directory
    if !query.path.starts_with("/Users/")
        && !query.path.starts_with("C:\\")
        && !query.path.starts_with("/home/")
    {
        return (http::StatusCode::FORBIDDEN, "Access denied: Outside allowed scope").into_response();
    }

    if !file_path.exists() {
        return (http::StatusCode::NOT_FOUND, "File not found").into_response();
    }

    match std::fs::read(&file_path) {
        Ok(buffer) => {
            if query.w.is_some() || query.h.is_some() {
                match image::load_from_memory(&buffer) {
                    Ok(img) => {
                        let (tw, th) = (query.w.unwrap_or(0), query.h.unwrap_or(0));
                        let resized = if tw > 0 && th > 0 {
                            img.resize(tw, th, image::imageops::FilterType::Lanczos3)
                        } else if tw > 0 {
                            img.resize(tw, u32::MAX, image::imageops::FilterType::Lanczos3)
                        } else if th > 0 {
                            img.resize(u32::MAX, th, image::imageops::FilterType::Lanczos3)
                        } else {
                            img
                        };

                        let mut buf = Vec::new();
                        resized
                            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
                            .unwrap_or_default();

                        Response::builder()
                            .status(http::StatusCode::OK)
                            .header(axum::http::header::CONTENT_TYPE, "image/png")
                            .body(buf.into())
                            .unwrap()
                    }
                    Err(e) => (
                        http::StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Resize error: {e}"),
                    )
                        .into_response(),
                }
            } else {
                let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("png");
                let mime = match ext {
                    "png" => "image/png",
                    "jpg" | "jpeg" => "image/jpeg",
                    "webp" => "image/webp",
                    "gif" => "image/gif",
                    _ => "image/png",
                };
                Response::builder()
                    .status(http::StatusCode::OK)
                    .header(axum::http::header::CONTENT_TYPE, mime)
                    .body(buffer.into())
                    .unwrap()
            }
        }
        Err(e) => (http::StatusCode::INTERNAL_SERVER_ERROR, format!("Proxy error: {e}")).into_response(),
    }
}

// === Config JSON ===

async fn config_json() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "apiEndpoints": {
            "chat": "/api/chat",
            "image": "/api/images"
        }
    }))
}

// === Utilities ===

fn unix_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", now.as_secs())
}
