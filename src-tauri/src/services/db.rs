use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use parking_lot::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRecord {
    pub id: String,
    #[serde(rename = "batchId")]
    pub batch_id: Option<String>,
    pub prompt: String,
    pub model: String,
    #[serde(rename = "aspectRatio")]
    pub aspect_ratio: Option<String>,
    #[serde(rename = "localPath")]
    pub local_path: Option<String>,
    pub url: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    pub status: String,
}

pub struct DbService {
    conn: Mutex<Option<Connection>>,
    db_path: Mutex<Option<PathBuf>>,
}

impl DbService {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
            db_path: Mutex::new(None),
        }
    }

    pub fn init(&self, app: &AppHandle) -> Result<(), String> {
        use tauri::Manager;
        let data_dir = app.path().app_local_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        
        let data_dir = data_dir.join("doubao-image-studio");
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data dir: {}", e))?;
        
        let db_path = data_dir.join("metadata.db");
        println!("[DB] Database path: {:?}", db_path);
        
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        
        // Initialize schema
        conn.execute(
            "CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                batch_id TEXT,
                prompt TEXT NOT NULL,
                model TEXT NOT NULL,
                aspect_ratio TEXT,
                local_path TEXT,
                url TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                status TEXT DEFAULT 'success'
            )",
            [],
        ).map_err(|e| format!("Failed to create table: {}", e))?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_batch_id ON images(batch_id)",
            [],
        ).map_err(|e| format!("Failed to create index: {}", e))?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_created_at ON images(created_at DESC)",
            [],
        ).map_err(|e| format!("Failed to create index: {}", e))?;
        
        *self.db_path.lock() = Some(db_path);
        *self.conn.lock() = Some(conn);
        
        println!("[DB] Database initialized successfully");
        Ok(())
    }

    pub fn save_image(&self, image: &ImageRecord) -> Result<(), String> {
        let guard = self.conn.lock();
        let conn = guard.as_ref().ok_or("Database not initialized")?;
        
        conn.execute(
            "INSERT OR REPLACE INTO images 
             (id, batch_id, prompt, model, aspect_ratio, local_path, url, created_at, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                image.id,
                image.batch_id,
                image.prompt,
                image.model,
                image.aspect_ratio,
                image.local_path,
                image.url,
                image.created_at,
                image.status,
            ],
        ).map_err(|e| format!("Failed to save image: {}", e))?;
        
        println!("[DB] Saved image: {}", image.id);
        Ok(())
    }

    pub fn get_images(&self, limit: i64, offset: i64) -> Result<Vec<ImageRecord>, String> {
        let guard = self.conn.lock();
        let conn = guard.as_ref().ok_or("Database not initialized")?;
        
        let mut stmt = conn.prepare(
            "SELECT id, batch_id, prompt, model, aspect_ratio, local_path, url, created_at, status 
             FROM images ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;
        
        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(ImageRecord {
                id: row.get(0)?,
                batch_id: row.get(1)?,
                prompt: row.get(2)?,
                model: row.get(3)?,
                aspect_ratio: row.get(4)?,
                local_path: row.get(5)?,
                url: row.get(6)?,
                created_at: row.get(7)?,
                status: row.get(8)?,
            })
        }).map_err(|e| format!("Failed to query: {}", e))?;
        
        let mut images = Vec::new();
        for row in rows {
            match row {
                Ok(img) => images.push(img),
                Err(e) => println!("[DB] Warning: failed to read row: {}", e),
            }
        }
        
        Ok(images)
    }

    pub fn delete_image(&self, id: &str) -> Result<(), String> {
        let guard = self.conn.lock();
        let conn = guard.as_ref().ok_or("Database not initialized")?;
        
        conn.execute("DELETE FROM images WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete image: {}", e))?;
        
        println!("[DB] Deleted image: {}", id);
        Ok(())
    }

    pub fn clear_all(&self) -> Result<(), String> {
        let guard = self.conn.lock();
        let conn = guard.as_ref().ok_or("Database not initialized")?;
        
        conn.execute("DELETE FROM images", [])
            .map_err(|e| format!("Failed to clear images: {}", e))?;
        
        println!("[DB] Cleared all images");
        Ok(())
    }
}

impl Default for DbService {
    fn default() -> Self {
        Self::new()
    }
}
