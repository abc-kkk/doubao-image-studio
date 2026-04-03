//! WebSocket handling for extension communication

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

/// Map of registered model -> WebSocket sender (wrapped in Arc<Mutex> for shared access)
#[derive(Default)]
pub struct WsClientMap {
    pub legacy: Option<Arc<Mutex<futures_util::stream::SplitSink<WebSocket, Message>>>>,
    pub models: HashMap<String, Arc<Mutex<futures_util::stream::SplitSink<WebSocket, Message>>>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum WsIncoming {
    #[serde(rename = "REGISTER")]
    Register { models: Vec<String> },
    #[serde(rename = "RESPONSE")]
    Response { request_id: String, content: serde_json::Value },
    #[serde(rename = "PROGRESS")]
    Progress { request_id: String, content: ProgressContent },
    #[serde(rename = "ERROR")]
    Error { request_id: String, error: String },
    #[serde(rename = "STREAM_CHUNK")]
    StreamChunk { request_id: String, delta: serde_json::Value },
    #[serde(rename = "STREAM_END")]
    StreamEnd { request_id: String, text: String, conversation_id: Option<String> },
}

#[derive(Debug, Deserialize)]
pub struct ProgressContent {
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct WsOutgoing {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub request_id: Option<String>,
    pub model: Option<String>,
    pub contents: Option<Vec<serde_json::Value>>,
    pub config: Option<serde_json::Value>,
    pub reference_images_b64: Option<Vec<String>>,
    pub aspect_ratio: Option<String>,
    pub switch_to_image_mode: Option<bool>,
}

impl WsOutgoing {
    pub fn generate(
        request_id: &str,
        model: &str,
        contents: Vec<serde_json::Value>,
        config: Option<serde_json::Value>,
        reference_images_b64: Vec<String>,
        aspect_ratio: Option<String>,
        switch_to_image_mode: Option<bool>,
    ) -> Self {
        Self {
            msg_type: "GENERATE".to_string(),
            request_id: Some(request_id.to_string()),
            model: Some(model.to_string()),
            contents: Some(contents),
            config,
            reference_images_b64: Some(reference_images_b64),
            aspect_ratio,
            switch_to_image_mode,
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

/// Handle WebSocket upgrade and connection
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    clients: Arc<RwLock<WsClientMap>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, clients))
}

/// Handle an individual WebSocket connection
async fn handle_socket(socket: WebSocket, clients: Arc<RwLock<WsClientMap>>) {
    let (write, read) = socket.split();

    // Wrap the write half in Arc<Mutex> for shared access
    let write_arc = Arc::new(Mutex::new(write));

    // Store as legacy client (default fallback)
    {
        let mut clients = clients.write().await;
        clients.legacy = Some(write_arc.clone());
        println!("✅ New Worker Connected!");
    }

    let mut read = read;
    let clients_clone = clients.clone();

    // Spawn a task to handle incoming messages
    tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    handle_message(&text, &clients_clone).await;
                }
                Ok(Message::Ping(data)) => {
                    let clients = clients_clone.write().await;
                    if let Some(ref write) = clients.legacy {
                        let mut write = write.lock().await;
                        let _ = write.send(Message::Pong(data)).await;
                    }
                }
                Ok(Message::Close(_)) => {
                    println!("❌ Worker Disconnected (close)");
                    let mut clients = clients_clone.write().await;
                    clients.legacy = None;
                    break;
                }
                Err(e) => {
                    println!("❌ WebSocket error: {e}");
                    let mut clients = clients_clone.write().await;
                    clients.legacy = None;
                    break;
                }
                _ => {}
            }
        }
    });
}

/// Handle incoming WebSocket message
async fn handle_message(text: &str, clients: &Arc<RwLock<WsClientMap>>) {
    // Ignore ping/pong messages
    let trimmed = text.trim().to_lowercase();
    if trimmed.starts_with('p') && trimmed.len() <= 2 {
        return;
    }

    let msg: Result<WsIncoming, _> = serde_json::from_str(text);
    match msg {
        Ok(WsIncoming::Register { models }) => {
            println!("📝 Worker Registered Models: {}", models.join(", "));
            let mut clients = clients.write().await;
            if let Some(ref write_arc) = clients.legacy {
                let write_clone = write_arc.clone();
                for model in models {
                    clients.models.insert(model, write_clone.clone());
                }
            }
        }
        Ok(WsIncoming::Response { request_id, content }) => {
            println!("📊 Response [{request_id}]: {content:?}");
        }
        Ok(WsIncoming::Progress { request_id, content }) => {
            println!("📊 Progress [{request_id}]: {}", content.text);
        }
        Ok(WsIncoming::Error { request_id, error }) => {
            println!("❌ Error [{request_id}]: {error}");
        }
        Ok(WsIncoming::StreamChunk { request_id, delta }) => {
            println!("📦 StreamChunk [{request_id}]: {delta:?}");
        }
        Ok(WsIncoming::StreamEnd { request_id, text, .. }) => {
            println!("🏁 StreamEnd [{request_id}]: {text}");
        }
        Err(e) => {
            if !e.to_string().contains("unknown variant") {
                println!("⚠️ Non-standard message: {e}");
            }
        }
    }
}
