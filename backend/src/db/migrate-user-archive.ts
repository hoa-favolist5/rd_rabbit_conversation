import { pool, closePool } from "./connection.js";

/**
 * Migration script to add user_archive table
 * Run with: npm run db:migrate-archive
 */
async function migrate() {
  console.log("🔧 Migrating database to add user_archive table...");

  try {
    // Create user_archive table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_archive (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        domain VARCHAR(50) NOT NULL CHECK (domain IN ('movie', 'gourmet', 'general')),
        item_id VARCHAR(255) NOT NULL,
        item_title VARCHAR(500),
        item_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, domain, item_id)
      )
    `);
    console.log("✅ Created user_archive table");

    // Create indexes for user_archive
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_archive_user_id ON user_archive(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_archive_domain ON user_archive(domain);
      CREATE INDEX IF NOT EXISTS idx_user_archive_user_domain ON user_archive(user_id, domain);
      CREATE INDEX IF NOT EXISTS idx_user_archive_created_at ON user_archive(created_at DESC);
    `);
    console.log("✅ Created user_archive indexes");

    console.log("🎉 Migration complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run migration
migrate().catch(console.error);
