import { pool } from "./connection.js";
import type { GourmetRestaurant, GourmetSearchResult } from "../types/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Gourmet");

const GOURMET_CACHE_TTL_MS = 2 * 60 * 1000;
const GOURMET_CACHE_LIMIT = 200;
const gourmetSearchCache = new Map<string, { value: GourmetSearchResult; timestamp: number }>();

function getCacheKey(query: string, area?: string, cuisine?: string): string {
  return `${query.trim().toLowerCase()}|${area || ""}|${cuisine || ""}`;
}

function getCachedResult(key: string): GourmetSearchResult | null {
  const entry = gourmetSearchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > GOURMET_CACHE_TTL_MS) {
    gourmetSearchCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedResult(key: string, value: GourmetSearchResult): void {
  if (gourmetSearchCache.size >= GOURMET_CACHE_LIMIT) {
    const firstKey = gourmetSearchCache.keys().next().value as string | undefined;
    if (firstKey) {
      gourmetSearchCache.delete(firstKey);
    }
  }
  gourmetSearchCache.set(key, { value, timestamp: Date.now() });
}

/**
 * Search gourmet restaurants by query, area, and/or cuisine type
 */
export async function searchGourmetRestaurants(
  query: string,
  area?: string,
  cuisine?: string
): Promise<GourmetSearchResult> {
  try {
    const cacheKey = getCacheKey(query, area, cuisine);
    const cached = getCachedResult(cacheKey);
    if (cached) {
      log.debug(`Cache hit for gourmet search: "${query}"`);
      return cached;
    }

    log.debug(`Gourmet search: query="${query}", area="${area || ""}", cuisine="${cuisine || ""}"`);

    // Query the production table data_archive_gourmet_restaurant
    // Columns: id, code, name, name_short, search_full, name_kana, address, 
    //          lat, lng, catch_copy, capacity, access, urls_pc, open_hours, etc.
    let sql = `
      SELECT
        id,
        code,
        name,
        name_short,
        address,
        lat,
        lng,
        catch_copy,
        capacity,
        access,
        urls_pc,
        open_hours,
        close_days,
        budget_id
      FROM data_archive_gourmet_restaurant
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Full-text search on name, address, and search_full
    if (query && query.trim().length > 0) {
      sql += ` AND (
        name ILIKE $${paramIndex} OR 
        name_short ILIKE $${paramIndex} OR
        address ILIKE $${paramIndex} OR
        search_full ILIKE $${paramIndex} OR
        catch_copy ILIKE $${paramIndex}
      )`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    // Filter by area (address contains the area name)
    if (area && area.trim().length > 0) {
      sql += ` AND address ILIKE $${paramIndex}`;
      params.push(`%${area}%`);
      paramIndex++;
    }

    // Filter by cuisine type (name or catch_copy contains cuisine)
    if (cuisine && cuisine.trim().length > 0) {
      sql += ` AND (name ILIKE $${paramIndex} OR catch_copy ILIKE $${paramIndex})`;
      params.push(`%${cuisine}%`);
      paramIndex++;
    }

    // Order by priority: has catch_copy first, then alphabetically
    // Limit results to top 10
    sql += ` ORDER BY 
      CASE WHEN catch_copy IS NOT NULL AND catch_copy != '' THEN 0 ELSE 1 END,
      name ASC
      LIMIT 10`;

    const result = await pool.query(sql, params);

    // Map to GourmetRestaurant interface
    const restaurants: GourmetRestaurant[] = result.rows.map((row) => ({
      id: row.id || null,
      code: row.code || null,
      name: row.name || "",
      name_short: row.name_short || null,
      address: row.address || null,
      lat: row.lat ? parseFloat(row.lat) : null,
      lng: row.lng ? parseFloat(row.lng) : null,
      catch_copy: row.catch_copy || null,
      capacity: row.capacity || null,
      access: row.access || null,
      urls_pc: row.urls_pc || null,
      open_hours: row.open_hours || null,
      close_days: row.close_days || null,
      budget_id: row.budget_id || null,
    }));

    const response = {
      restaurants,
      total: restaurants.length,
    };
    
    // Log search results summary
    if (restaurants.length > 0) {
      const names = restaurants.slice(0, 3).map(r => r.name).join(", ");
      const more = restaurants.length > 3 ? ` +${restaurants.length - 3} more` : "";
      log.debug(`✅ Found ${restaurants.length} restaurants: ${names}${more}`);
    } else {
      log.debug(`❌ No restaurants found for query: "${query}"`);
    }
    
    setCachedResult(cacheKey, response);
    return response;
  } catch (error) {
    log.error("Gourmet search error:", error);
    // Return empty result on error (database might not be set up)
    return { restaurants: [], total: 0 };
  }
}
