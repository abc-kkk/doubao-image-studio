//! Integrated Rust server for doubao-tauri
//! Replaces the Node.js server with native Rust implementation

mod db;
mod routes;
mod websocket;

pub use db::Db;
pub use routes::create_app;
pub use websocket::WsClientMap;

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{broadcast, RwLock};

/// Shared application state for the HTTP server
pub struct AppState {
    pub db: Arc<Db>,
    pub ws_clients: Arc<RwLock<WsClientMap>>,
    pub tx: broadcast::Sender<String>,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            db: self.db.clone(),
            ws_clients: self.ws_clients.clone(),
            tx: self.tx.clone(),
        }
    }
}

/// Start the server on the given port
/// The `listening` parameter is set to true when server successfully starts listening
pub async fn start_server(port: u16, db: Db, listening: Option<Arc<AtomicBool>>) -> Result<(), String> {
    let (tx, _rx) = broadcast::channel::<String>(100);
    let ws_clients: Arc<RwLock<WsClientMap>> = Arc::new(RwLock::new(WsClientMap::default()));

    let state = AppState {
        db: Arc::new(db),
        ws_clients,
        tx,
    };

    let app = create_app(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    println!("🚀 Doubao AI Studio Server starting on http://0.0.0.0:{port}");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind port {port}: {e}"))?;

    // Server is now listening
    println!("✅ Server listening on http://0.0.0.0:{port}");
    println!("📱 Web App: http://localhost:{port}");
    println!("🔌 WebSocket: ws://localhost:{port}/ws");

    // Signal that server is now listening
    if let Some(flag) = listening {
        flag.store(true, Ordering::SeqCst);
    }

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("Server error: {e}"))?;

    Ok(())
}
