/**
 * Setup script for gourmet_restaurant table
 * Run with: npx tsx src/db/setup-gourmet.ts
 */

import { pool } from "./connection.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("DB-Setup-Gourmet");

async function setupGourmetTable() {
  try {
    log.info("🔧 Setting up gourmet restaurant table...");

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'data_archive_gourmet_restaurant'
      );
    `);

    const tableExists = tableCheck.rows[0].exists;

    if (!tableExists) {
      log.info("📋 Creating data_archive_gourmet_restaurant table...");
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.data_archive_gourmet_restaurant (
          id integer PRIMARY KEY,
          code character varying(20),
          name character varying(255),
          name_short character varying(255),
          search_full text,
          name_kana character varying(255),
          address text,
          lat numeric(10,8),
          lng numeric(11,8),
          lat_short numeric(10,8),
          long_short numeric(11,8),
          logo_image text,
          logo_image_hotpepper text,
          catch_copy text,
          capacity integer,
          access text,
          mobile_access text,
          urls_pc text,
          open_hours text,
          close_days text,
          party_capacity integer,
          other_memo text,
          budget_id integer,
          created_at timestamp without time zone,
          updated_at timestamp without time zone,
          is_temp smallint,
          _synced_at timestamp with time zone DEFAULT now(),
          _sync_hash character varying(64),
          canonical_id character varying(36)
        );
      `);

      log.info("✅ Table created successfully!");
    } else {
      log.info("ℹ️  Table already exists");
    }

    // Check row count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM data_archive_gourmet_restaurant'
    );
    const count = parseInt(countResult.rows[0].count);

    log.info(`📊 Current restaurant count: ${count}`);

    if (count === 0) {
      log.warn("⚠️  No restaurants in database!");
      log.warn("   Please import data using: psql -d rabbit_movies -f insert_gourmet_restaurants.sql");
      log.warn("   Or check if the SQL file exists in the project root");
    } else {
      // Show sample restaurants
      const sampleResult = await pool.query(
        'SELECT id, name, address FROM data_archive_gourmet_restaurant LIMIT 5'
      );
      
      log.info("📋 Sample restaurants:");
      sampleResult.rows.forEach((row, i) => {
        const addressPreview = row.address?.substring(0, 30) || "N/A";
        log.info(`   ${i + 1}. ${row.name} (${addressPreview}...)`);
      });
    }

    await pool.end();
    log.info("✅ Setup complete!");
    process.exit(0);
  } catch (error) {
    log.error("❌ Setup failed:", error);
    await pool.end();
    process.exit(1);
  }
}

setupGourmetTable();
