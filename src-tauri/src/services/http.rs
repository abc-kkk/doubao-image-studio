use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, RwLock as TokioRwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message};

use crate::services::db::DbService;

pub struct HttpService {
    port: parking_lot::RwLock<Option<u16>>,
    shutdown_tx: parking_lot::RwLock<Option<mpsc::Sender<()>>>,
    /// Map of connection_id -> sender for all connections
    connections: Arc<TokioRwLock<HashMap<String, mpsc::Sender<String>>>>,
    /// Map of connection_id -> registered models
    connection_models: Arc<TokioRwLock<HashMap<String, Vec<String>>>>,
    /// Map of request_id -> pending request info
    pending_requests: Arc<TokioRwLock<HashMap<String, PendingRequest>>>,
    db: Arc<DbService>,
}

#[derive(Debug, Clone)]
pub struct PendingRequest {
    pub connection_id: String,
    pub response_tx: mpsc::Sender<serde_json::Value>,
}

impl HttpService {
    pub fn new(db: Arc<DbService>) -> Self {
        Self {
            port: parking_lot::RwLock::new(None),
            shutdown_tx: parking_lot::RwLock::new(None),
            connections: Arc::new(TokioRwLock::new(HashMap::new())),
            connection_models: Arc::new(TokioRwLock::new(HashMap::new())),
            pending_requests: Arc::new(TokioRwLock::new(HashMap::new())),
            db,
        }
    }

    pub async fn start(&self, port: u16) -> Result<(), String> {
        let addr = format!("0.0.0.0:{}", port);
        println!("[HTTP] Starting HTTP+WS server on {}", addr);
        
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind: {}", e))?;
        
        *self.port.write() = Some(port);
        
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        *self.shutdown_tx.write() = Some(shutdown_tx);
        
        let connections = self.connections.clone();
        let pending_requests = self.pending_requests.clone();
        let connection_models = self.connection_models.clone();
        let db = self.db.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    result = listener.accept() => {
                        match result {
                            Ok((stream, addr)) => {
                                let connections = connections.clone();
                                let pending_requests = pending_requests.clone();
                                let connection_models = connection_models.clone();
                                let db = db.clone();
                                tokio::spawn(handle_connection(stream, addr, connections, pending_requests, connection_models, db));
                            }
                            Err(e) => eprintln!("[HTTP] Accept error: {}", e),
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        println!("[HTTP] Shutting down...");
                        break;
                    }
                }
            }
        });
        
        Ok(())
    }
    
    pub fn get_port(&self) -> Option<u16> {
        *self.port.read()
    }
    
    pub async fn stop(&self) {
        if let Some(tx) = self.shutdown_tx.write().take() {
            let _ = tx.send(()).await;
        }
    }
    
    pub fn is_running(&self) -> bool {
        self.port.read().is_some()
    }
    
    pub fn get_connections(&self) -> Arc<TokioRwLock<HashMap<String, mpsc::Sender<String>>>> {
        self.connections.clone()
    }

    pub fn get_connection_models(&self) -> Arc<TokioRwLock<HashMap<String, Vec<String>>>> {
        self.connection_models.clone()
    }

    pub fn get_pending_requests(&self) -> Arc<TokioRwLock<HashMap<String, PendingRequest>>> {
        self.pending_requests.clone()
    }
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

async fn handle_connection(
    mut stream: TcpStream,
    addr: std::net::SocketAddr,
    connections: Arc<TokioRwLock<HashMap<String, mpsc::Sender<String>>>>,
    pending_requests: Arc<TokioRwLock<HashMap<String, PendingRequest>>>,
    connection_models: Arc<TokioRwLock<HashMap<String, Vec<String>>>>,
    db: Arc<DbService>,
) {
    // Check if it's a WebSocket upgrade request by peeking
    let mut peek_buf = [0u8; 16];
    let is_ws = match stream.peek(&mut peek_buf).await {
        Ok(n) if n >= 4 => &peek_buf[..4] == b"GET " || &peek_buf[..4] == b"get ",
        _ => false,
    };
    
    if !is_ws {
        // Read HTTP request
        let mut buffer = vec![0u8; 8192];
        let n = match stream.read(&mut buffer).await {
            Ok(n) if n > 0 => n,
            _ => return,
        };
        buffer.truncate(n);
        handle_http_request(stream, &buffer, &db, &connections, &pending_requests, &connection_models).await;
        return;
    }
    
    // Handle WebSocket connection
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("Unsupported HTTP") || 
               err_str.contains("Handshake") ||
               err_str.contains("invalid") {
                println!("[WS] Non-websocket connection rejected from {}", addr);
            } else {
                eprintln!("[WS] Handshake failed from {}: {}", addr, e);
            }
            return;
        }
    };
    
    println!("[WS] New connection: {}", addr);
    
    // Generate unique connection ID
    let conn_id = format!("{}_{}", addr, current_timestamp());
    let addr_str = addr.to_string();
    
    // Channel for sending messages to this connection
    let (tx, mut rx) = mpsc::channel::<String>(100);
    
    // Register this connection
    connections.write().await.insert(conn_id.clone(), tx.clone());
    
    let (write, mut read) = ws_stream.split();
    let write = Arc::new(tokio::sync::Mutex::new(write));
    
    // Task to send messages
    let write_clone = write.clone();
    let send_task = tokio::spawn(async move {
        let write = write_clone;
        while let Some(msg) = rx.recv().await {
            let mut w = write.lock().await;
            if w.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });
    
    // Process incoming messages
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let text_str = text.to_string();
                
                // Handle ping
                if text_str.trim().to_lowercase() == "ping" {
                    let mut w = write.lock().await;
                    let _ = w.send(Message::Pong(vec![])).await;
                    continue;
                }
                
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text_str) {
                    let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let request_id = parsed.get("requestId").and_then(|v| v.as_str()).unwrap_or("");
                    
                    match msg_type {
                        "REGISTER" => {
                            let models = parsed.get("models")
                                .and_then(|v| v.as_array())
                                .map(|arr| arr.iter().filter_map(|v| v.as_str()).map(String::from).collect::<Vec<_>>())
                                .unwrap_or_default();
                            println!("[WS] {} registered models: {:?}", addr_str, models);
                            // Store registered models for this connection
                            connection_models.write().await.insert(conn_id.clone(), models);
                        }
                        
                        "GENERATE" => {
                            let original_request_id = request_id.to_string();
                            println!("[WS] Received GENERATE from {}: {}", addr_str, original_request_id);
                            
                            // Generate a new server-side request ID for routing
                            let server_request_id = format!("srv_{}_{}", current_timestamp(), conn_id.replace(":", "_"));
                            
                            // Modify the message to use server_request_id
                            let mut broadcast_msg = parsed.clone();
                            if let Some(obj) = broadcast_msg.as_object_mut() {
                                obj.insert("requestId".to_string(), serde_json::Value::String(server_request_id.clone()));
                            }
                            
                            // Broadcast to ALL other connections
                            {
                                let connections_guard = connections.read().await;
                                let ids: Vec<String> = connections_guard.keys().cloned().collect();
                                drop(connections_guard);
                                
                                for other_id in ids {
                                    if other_id != conn_id {
                                        if let Some(other_tx) = connections.read().await.get(&other_id) {
                                            println!("[WS] Broadcasting GENERATE (new id: {}) to {}", server_request_id, other_id);
                                            let broadcast_str = serde_json::to_string(&broadcast_msg).unwrap();
                                            let _ = other_tx.send(broadcast_str).await;
                                        }
                                    }
                                }
                            }
                            
                            // Store pending request info with server_request_id
                            let (response_tx, mut response_rx) = mpsc::channel(1);
                            pending_requests.write().await.insert(server_request_id.clone(), PendingRequest {
                                connection_id: conn_id.clone(),
                                response_tx,
                            });
                            
                            // Wait for response or timeout
                            let timeout_result = tokio::time::timeout(
                                tokio::time::Duration::from_secs(240),
                                response_rx.recv()
                            ).await;
                            
                            match timeout_result {
                                Ok(Some(response)) => {
                                    println!("[WS] Sending response back to frontend: {}", original_request_id);
                                    // Replace server_request_id with original_request_id
                                    let mut resp_to_send = response.clone();
                                    if let Some(obj) = resp_to_send.as_object_mut() {
                                        obj.insert("requestId".to_string(), serde_json::Value::String(original_request_id.clone()));
                                    }
                                    let resp_str = serde_json::to_string(&resp_to_send).unwrap();
                                    let _ = tx.send(resp_str).await;
                                }
                                Ok(None) => {
                                    println!("[WS] Response channel closed");
                                }
                                Err(_) => {
                                    println!("[WS] Response timeout for {}", original_request_id);
                                    let resp = json!({
                                        "type": "ERROR",
                                        "requestId": original_request_id,
                                        "error": "Request timeout - please ensure the content script is loaded on doubao.com",
                                    });
                                    let resp_str = serde_json::to_string(&resp).unwrap();
                                    let _ = tx.send(resp_str).await;
                                }
                            }
                            
                            // Cleanup pending request
                            pending_requests.write().await.remove(&server_request_id);
                        }
                        
                        "RESPONSE" | "RESULT" => {
                            println!("[WS] Received {} from {}: {:?}", msg_type, addr_str, text_str);
                            
                            // Extract requestId
                            if let Some(req_id) = parsed.get("requestId").and_then(|v| v.as_str()) {
                                // Find pending request
                                if let Some(pending) = pending_requests.write().await.remove(req_id) {
                                    println!("[WS] Found pending request {}, forwarding response", req_id);
                                    let _ = pending.response_tx.send(parsed.clone()).await;
                                } else {
                                    // No pending request - broadcast to all other connections
                                    println!("[WS] No pending request, broadcasting {} to all", msg_type);
                                    
                                    let connections_guard = connections.read().await;
                                    let ids: Vec<String> = connections_guard.keys().cloned().collect();
                                    drop(connections_guard);
                                    
                                    for other_id in ids {
                                        if other_id != conn_id {
                                            if let Some(other_tx) = connections.read().await.get(&other_id) {
                                                let _ = other_tx.send(text_str.clone()).await;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        "ERROR" => {
                            println!("[WS] Received ERROR from {}: {:?}", addr_str, text_str);
                            
                            if let Some(req_id) = parsed.get("requestId").and_then(|v| v.as_str()) {
                                if let Some(pending) = pending_requests.write().await.remove(req_id) {
                                    let _ = pending.response_tx.send(parsed.clone()).await;
                                }
                            }
                        }
                        
                        "PROGRESS" => {
                            println!("[WS] Received PROGRESS from {}", addr_str);
                        }
                        
                        _ => {
                            // Broadcast to all other connections
                            let connections_guard = connections.read().await;
                            let ids: Vec<String> = connections_guard.keys().cloned().collect();
                            drop(connections_guard);
                            
                            for other_id in ids {
                                if other_id != conn_id {
                                    if let Some(other_tx) = connections.read().await.get(&other_id) {
                                        let _ = other_tx.send(text_str.clone()).await;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            Ok(Message::Ping(data)) => {
                let mut w = write.lock().await;
                let _ = w.send(Message::Pong(data)).await;
            }
            
            Ok(Message::Close(_)) | Err(_) => {
                println!("[WS] Connection closed: {}", addr_str);
                break;
            }
            
            _ => {}
        }
    }
    
    // Cleanup
    connections.write().await.remove(&conn_id);
    connection_models.write().await.remove(&conn_id);
    send_task.abort();
}

#[derive(Debug, Clone, Serialize)]
struct ImageRecordResponse {
    success: bool,
    id: String,
    url: String,
    prompt: String,
    model: String,
    #[serde(rename = "aspectRatio")]
    aspect_ratio: Option<String>,
    #[serde(rename = "localPath")]
    local_path: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: i64,
    status: String,
}

async fn handle_image_generate(
    mut stream: TcpStream,
    buffer: &[u8],
    connections: &Arc<TokioRwLock<HashMap<String, mpsc::Sender<String>>>>,
    pending_requests: &Arc<TokioRwLock<HashMap<String, PendingRequest>>>,
    connection_models: &Arc<TokioRwLock<HashMap<String, Vec<String>>>>,
) {
    println!("[HTTP] Received image generation request");

    // Extract body from buffer
    let body_start = buffer.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4).unwrap_or(0);
    let body = &buffer[body_start..];

    if let Ok(data) = serde_json::from_slice::<serde_json::Value>(body) {
        let prompt = data.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
        let aspect_ratio = data.get("aspect_ratio").and_then(|v| v.as_str()).unwrap_or("1:1");
        let reference_images = data.get("reference_images").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>()).unwrap_or_default();
        let switch_to_image_mode = data.get("switch_to_image_mode").and_then(|v| v.as_bool()).unwrap_or(false);

        let display_prompt: String = prompt.chars().take(50).collect();
        println!("[HTTP] Generating: prompt={}, aspect={}", display_prompt, aspect_ratio);

        // Generate unique request ID
        let server_request_id = format!("srv_{}_{}", current_timestamp(), std::process::id());

        // Find extension connection (registered "doubao-pro-image")
        let worker_conn_id = {
            let models_guard = connection_models.read().await;
            models_guard.iter()
                .find(|(_, models)| models.iter().any(|m| m == "doubao-pro-image"))
                .map(|(conn_id, _)| conn_id.clone())
        };

        if let Some(worker_id) = worker_conn_id {
            println!("[HTTP] Found extension connection: {}", worker_id);
            // Create pending request
            let (response_tx, mut response_rx) = mpsc::channel(1);
            pending_requests.write().await.insert(server_request_id.clone(), PendingRequest {
                connection_id: worker_id.clone(),
                response_tx,
            });
            
            // Build message for extension
            let msg = json!({
                "type": "GENERATE",
                "requestId": server_request_id,
                "model": "doubao-pro-image",
                "contents": [{
                    "parts": [{ "text": prompt }]
                }],
                "aspect_ratio": aspect_ratio,
                "reference_images": reference_images,
                "switch_to_image_mode": switch_to_image_mode
            });
            
            // Send to worker via WebSocket
            if let Some(worker_tx) = connections.read().await.get(&worker_id) {
                let msg_str = serde_json::to_string(&msg).unwrap();
                println!("[HTTP] Sending GENERATE: {}", msg_str);
                let _ = worker_tx.send(msg_str).await;
                println!("[HTTP] Sent GENERATE to worker: {}", worker_id);
            } else {
                println!("[HTTP] Worker connection not found!");
            }
            
            // Wait for response with timeout
            let timeout_result = tokio::time::timeout(
                tokio::time::Duration::from_secs(120),
                response_rx.recv()
            ).await;
            
            match timeout_result {
                Ok(Some(response)) => {
                    println!("[HTTP] Got response from worker");
                    
                    // Parse response and extract images
                    let images = if let Some(imgs) = response.get("images").and_then(|v| v.as_array()) {
                        imgs.iter().map(|img| {
                            json!({
                                "url": img.get("url").or_else(|| img.get("imageUrl")).cloned().unwrap_or(serde_json::Value::String("".to_string())),
                                "thumbnail_url": img.get("thumbnail_url").cloned(),
                                "width": img.get("width").cloned(),
                                "height": img.get("height").cloned()
                            })
                        }).collect::<Vec<_>>()
                    } else if let Some(text) = response.get("text").and_then(|v| v.as_str()) {
                        // Handle text response (might be error)
                        if text.starts_with("Error:") {
                            let resp = json!({
                                "success": false,
                                "error": text,
                                "images": []
                            });
                            let _ = send_json(&mut stream, 500, &resp).await;
                            pending_requests.write().await.remove(&server_request_id);
                            return;
                        }
                        vec![]
                    } else {
                        vec![]
                    };
                    
                    let resp = json!({
                        "success": true,
                        "images": images,
                        "text": response.get("text").or_else(|| response.get("content"))
                    });
                    let _ = send_json(&mut stream, 200, &resp).await;
                }
                Ok(None) => {
                    println!("[HTTP] Response channel closed");
                    let resp = json!({ "success": false, "error": "Worker disconnected", "images": [] });
                    let _ = send_json(&mut stream, 500, &resp).await;
                }
                Err(_) => {
                    println!("[HTTP] Response timeout");
                    let resp = json!({ "success": false, "error": "Timeout - please ensure doubao.com is open", "images": [] });
                    let _ = send_json(&mut stream, 504, &resp).await;
                }
            }
            
            pending_requests.write().await.remove(&server_request_id);
        } else {
            let resp = json!({ "success": false, "error": "No extension connected", "images": [] });
            let _ = send_json(&mut stream, 503, &resp).await;
        }
    } else {
        let resp = json!({ "success": false, "error": "Invalid JSON body" });
        let _ = send_json(&mut stream, 400, &resp).await;
    }
}

async fn handle_http_request(
    mut stream: TcpStream,
    buffer: &[u8],
    db: &Arc<DbService>,
    connections: &Arc<TokioRwLock<HashMap<String, mpsc::Sender<String>>>>,
    pending_requests: &Arc<TokioRwLock<HashMap<String, PendingRequest>>>,
    connection_models: &Arc<TokioRwLock<HashMap<String, Vec<String>>>>,
) {
    let text = String::from_utf8_lossy(buffer);
    let mut lines = text.lines();
    
    let first_line = match lines.next() {
        Some(line) => line,
        None => return,
    };
    
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    
    let method = parts[0];
    let path = parts[1];
    
    match (method, path) {
        ("GET", "/api/health") => {
            let response = json!({
                "status": "running",
                "version": "3.0.0-rust",
                "timestamp": current_timestamp(),
            });
            send_json(&mut stream, 200, &response).await;
        }
        
        ("GET", "/api/history") => {
            match db.get_images(200, 0) {
                Ok(images) => {
                    let result: Vec<_> = images.into_iter().map(|img| {
                        ImageRecordResponse {
                            success: true,
                            id: img.id,
                            url: img.url,
                            prompt: img.prompt,
                            model: img.model,
                            aspect_ratio: img.aspect_ratio,
                            local_path: img.local_path,
                            created_at: img.created_at,
                            status: img.status,
                        }
                    }).collect();
                    send_json(&mut stream, 200, &serde_json::to_value(&result).unwrap_or(json!({}))).await;
                }
                Err(e) => {
                    let resp = json!({ "success": false, "error": e.to_string() });
                    send_json(&mut stream, 500, &resp).await;
                }
            }
        }
        
        ("POST", "/api/history") => {
            // Extract body from buffer
            let body_start = text.find("\r\n\r\n").map(|i| i + 4).unwrap_or(0);
            let body = &buffer[body_start..];
            
            if let Ok(data) = serde_json::from_slice::<serde_json::Value>(body) {
                let image = crate::services::db::ImageRecord {
                    id: data.get("id").and_then(|v| v.as_str()).unwrap_or(&"").to_string(),
                    batch_id: data.get("batchId").and_then(|v| v.as_str()).map(String::from),
                    prompt: data.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    model: data.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    aspect_ratio: data.get("aspectRatio").and_then(|v| v.as_str()).map(String::from),
                    local_path: data.get("localPath").and_then(|v| v.as_str()).map(String::from),
                    url: data.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    created_at: data.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0),
                    status: data.get("status").and_then(|v| v.as_str()).unwrap_or("success").to_string(),
                };
                
                match db.save_image(&image) {
                    Ok(_) => {
                        let resp = json!({ "success": true, "id": image.id });
                        send_json(&mut stream, 200, &resp).await;
                    }
                    Err(e) => {
                        let resp = json!({ "success": false, "error": e.to_string() });
                        send_json(&mut stream, 500, &resp).await;
                    }
                }
            } else {
                let resp = json!({ "success": false, "error": "Invalid JSON" });
                send_json(&mut stream, 400, &resp).await;
            }
        }
        
        ("DELETE", path) if path.starts_with("/api/history/") => {
            let id_str = path.strip_prefix("/api/history/").unwrap_or("");
            
            match db.delete_image(id_str) {
                Ok(_) => {
                    let resp = json!({ "success": true });
                    send_json(&mut stream, 200, &resp).await;
                }
                Err(e) => {
                    let resp = json!({ "success": false, "error": e.to_string() });
                    send_json(&mut stream, 500, &resp).await;
                }
            }
        }
        
        ("POST", "/api/images/generate") => {
            // Pass to handler with connections, pending_requests, and connection_models
            handle_image_generate(stream, buffer, &connections, &pending_requests, &connection_models).await;
        }
        
        ("OPTIONS", _) => {
            send_raw(&mut stream, 204, "", &[("Access-Control-Allow-Origin", "*")]).await;
        }
        
        _ => {
            let resp = json!({ "status": "not found" });
            send_json(&mut stream, 404, &resp).await;
        }
    }
}

async fn send_json(stream: &mut TcpStream, status: u16, data: &serde_json::Value) {
    let body = data.to_string();
    let response = format!(
        "HTTP/1.1 {} OK\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         Access-Control-Allow-Origin: *\r\n\
         \r\n\
         {}",
        status,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
}

async fn send_raw(stream: &mut TcpStream, status: u16, body: &str, extra_headers: &[(&str, &str)]) {
    let headers = extra_headers
        .iter()
        .map(|(k, v)| format!("{}: {}\r\n", k, v))
        .collect::<String>();
    
    let response = format!(
        "HTTP/1.1 {} OK\r\n\
         {}\r\n\
         {}",
        status,
        headers,
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
}
