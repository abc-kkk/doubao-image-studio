//! Database module for SQLite operations

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRecord {
    pub id: String,
    pub url: String,
    pub thumbnail_url: Option<String>,
    pub prompt: String,
    pub model: String,
    pub width: i32,
    pub height: i32,
    pub local_path: Option<String>,
    pub created_at: String,
}

pub struct Db {
    // Using Mutex for interior mutability - safe since we run in single-threaded context
    conn: Mutex<Connection>,
}

impl Db {
    /// Open or create the database at the given path
    pub fn new(path: &PathBuf) -> Result<Self, String> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
            }
        }

        let conn = Connection::open(path).map_err(|e| format!("Failed to open DB: {e}"))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                thumbnail_url TEXT,
                prompt TEXT NOT NULL,
                model TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                local_path TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| format!("Failed to create table: {e}"))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }


    /// Save a new image record
    pub fn save_image(&self, image: &ImageRecord) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {e}"))?;
        conn.execute(
            "INSERT OR REPLACE INTO images (id, url, thumbnail_url, prompt, model, width, height, local_path, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                image.id,
                image.url,
                image.thumbnail_url,
                image.prompt,
                image.model,
                image.width,
                image.height,
                image.local_path,
                image.created_at,
            ],
        )
        .map_err(|e| format!("DB error: {e}"))?;
        Ok(())
    }

    /// Get recent images (limit to N)
    pub fn get_images(&self, limit: i32) -> Result<Vec<ImageRecord>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {e}"))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, url, thumbnail_url, prompt, model, width, height, local_path, created_at
                 FROM images ORDER BY created_at DESC LIMIT ?1",
            )
            .map_err(|e| format!("Prepare error: {e}"))?;

        let rows = stmt
            .query_map([limit], |row| {
                Ok(ImageRecord {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    thumbnail_url: row.get(2)?,
                    prompt: row.get(3)?,
                    model: row.get(4)?,
                    width: row.get(5)?,
                    height: row.get(6)?,
                    local_path: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("Query error: {e}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row error: {e}"))
    }

    /// Delete an image by id
    pub fn delete_image(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {e}"))?;
        conn.execute("DELETE FROM images WHERE id = ?1", [id])
            .map_err(|e| format!("DB error: {e}"))?;
        Ok(())
    }

    /// Clear all images
    pub fn clear_all(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {e}"))?;
        conn.execute("DELETE FROM images", [])
            .map_err(|e| format!("DB error: {e}"))?;
        Ok(())
    }
}
