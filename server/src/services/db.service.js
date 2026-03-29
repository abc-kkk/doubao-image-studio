import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the data directory exists
const dbPath = path.join(__dirname, '../../data/metadata.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize schema
db.exec(`
    CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        prompt TEXT,
        model TEXT,
        aspect_ratio TEXT,
        local_path TEXT,
        url TEXT,
        created_at INTEGER,
        status TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_batch_id ON images(batch_id);
    CREATE INDEX IF NOT EXISTS idx_created_at ON images(created_at);
`);

class DbService {
    saveImage(image) {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO images 
            (id, batch_id, prompt, model, aspect_ratio, local_path, url, created_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            image.id,
            image.batchId || null,
            image.prompt,
            image.model,
            image.aspectRatio,
            image.localPath || null,
            image.url,
            image.createdAt || Date.now(),
            image.status || 'success'
        );
    }

    getImages(limit = 100, offset = 0) {
        const stmt = db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?');
        return stmt.all(limit, offset).map(img => ({
            id: img.id,
            batchId: img.batch_id,
            prompt: img.prompt,
            model: img.model,
            aspectRatio: img.aspect_ratio,
            localPath: img.local_path,
            url: img.url,
            createdAt: img.created_at,
            status: img.status
        }));
    }

    deleteImage(id) {
        const stmt = db.prepare('DELETE FROM images WHERE id = ?');
        return stmt.run(id);
    }

    clearAll() {
        const stmt = db.prepare('DELETE FROM images');
        return stmt.run();
    }
}

export default new DbService();
