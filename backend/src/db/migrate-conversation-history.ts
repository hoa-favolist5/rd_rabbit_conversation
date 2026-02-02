import { pool, closePool } from "./connection.js";

/**
 * Migration script to add conversation_history table to existing database
 * Run with: tsx src/db/migrate-conversation-history.ts
 */
async function migrate() {
  console.log("🔧 Running conversation_history migration...");

  try {
    // Check if table already exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'conversation_history'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log("ℹ️  conversation_history table already exists");
      
      // Check if domain column exists
      const columnCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'conversation_history'
          AND column_name = 'domain'
        );
      `);

      if (columnCheck.rows[0].exists) {
        console.log("✅ Domain column already exists");
      } else {
        console.log("➕ Adding domain column...");
        await pool.query(`
          ALTER TABLE conversation_history 
          ADD COLUMN domain VARCHAR(50) NOT NULL DEFAULT 'movie';
        `);
        console.log("✅ Domain column added");
      }

      // Check and add user_id column
      const userIdCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'conversation_history'
          AND column_name = 'user_id'
        );
      `);

      if (!userIdCheck.rows[0].exists) {
        console.log("➕ Adding user_id column...");
        await pool.query(`
          ALTER TABLE conversation_history 
          ADD COLUMN user_id VARCHAR(255);
        `);
        console.log("✅ user_id column added");
      }

      // Check and add user_name column
      const userNameCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'conversation_history'
          AND column_name = 'user_name'
        );
      `);

      if (!userNameCheck.rows[0].exists) {
        console.log("➕ Adding user_name column...");
        await pool.query(`
          ALTER TABLE conversation_history 
          ADD COLUMN user_name VARCHAR(255);
        `);
        console.log("✅ user_name column added");
      }

      // Check and add user_token column
      const userTokenCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'conversation_history'
          AND column_name = 'user_token'
        );
      `);

      if (!userTokenCheck.rows[0].exists) {
        console.log("➕ Adding user_token column...");
        await pool.query(`
          ALTER TABLE conversation_history 
          ADD COLUMN user_token TEXT;
        `);
        console.log("✅ user_token column added");
      }
    } else {
      console.log("📦 Creating conversation_history table...");
      
      // Create conversation_history table
      await pool.query(`
        CREATE TABLE conversation_history (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255),
          user_name VARCHAR(255),
          user_token TEXT,
          role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          domain VARCHAR(50) NOT NULL DEFAULT 'movie',
          emotion VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("✅ Created conversation_history table");

      // Create indexes
      await pool.query(`
        CREATE INDEX idx_conversation_session_id ON conversation_history(session_id);
        CREATE INDEX idx_conversation_user_id ON conversation_history(user_id);
        CREATE INDEX idx_conversation_domain ON conversation_history(domain);
        CREATE INDEX idx_conversation_created_at ON conversation_history(created_at DESC);
        CREATE INDEX idx_conversation_session_domain ON conversation_history(session_id, domain);
        CREATE INDEX idx_conversation_user_domain ON conversation_history(user_id, domain);
      `);
      console.log("✅ Created indexes");
    }

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
