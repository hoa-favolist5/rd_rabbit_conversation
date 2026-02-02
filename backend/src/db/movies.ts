import { pool } from "./connection.js";
import type { Movie, MovieSearchResult } from "../types/index.js";
import { expandSearchQuery } from "../utils/crossLanguageSearch.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Movies");

const MOVIE_CACHE_TTL_MS = 2 * 60 * 1000;
const MOVIE_CACHE_LIMIT = 200;
const movieSearchCache = new Map<string, { value: MovieSearchResult; timestamp: number }>();

function getCacheKey(query: string, genre?: string, year?: number): string {
  return `${query.trim().toLowerCase()}|${genre || ""}|${year || ""}`;
}

function getCachedResult(key: string): MovieSearchResult | null {
  const entry = movieSearchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > MOVIE_CACHE_TTL_MS) {
    movieSearchCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedResult(key: string, value: MovieSearchResult): void {
  if (movieSearchCache.size >= MOVIE_CACHE_LIMIT) {
    const firstKey = movieSearchCache.keys().next().value as string | undefined;
    if (firstKey) {
      movieSearchCache.delete(firstKey);
    }
  }
  movieSearchCache.set(key, { value, timestamp: Date.now() });
}

/**
 * Search movies by query, genre, and/or year
 */
export async function searchMovies(
  query: string,
  genre?: string,
  year?: number
): Promise<MovieSearchResult> {
  try {
    const cacheKey = getCacheKey(query, genre, year);
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }
    // Expand query to include cross-language variants (English ↔ Japanese)
    // Example: "matrix" -> ["matrix", "マトリックス"]
    const searchTerms = query ? expandSearchQuery(query) : [];

    log.debug(`Movie search: "${query}" -> [${searchTerms.join(", ")}]`);

    // Query the production table data_archive_movie_master
    // Columns: id, title, overview, release_date, vote_average
    let sql = `
      SELECT
        id,
        title,
        overview,
        release_date,
        vote_average
      FROM data_archive_movie_master
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Full-text search on title and overview with cross-language expansion
    if (searchTerms.length > 0) {
      // Build OR conditions for all search term variants
      const conditions = searchTerms.map(() => {
        const idx = paramIndex++;
        return `(title ILIKE $${idx} OR overview ILIKE $${idx})`;
      });
      sql += ` AND (${conditions.join(" OR ")})`;

      // Add parameters for each search term
      searchTerms.forEach(term => {
        params.push(`%${term}%`);
      });
    }

    // Filter by year (extract year from release_date)
    if (year) {
      sql += ` AND EXTRACT(YEAR FROM release_date) = $${paramIndex}`;
      params.push(year);
      paramIndex++;
    }

    // Order by rating and limit results
    sql += ` ORDER BY vote_average DESC NULLS LAST LIMIT 10`;

    const result = await pool.query(sql, params);

    // Map to Movie interface - align with actual column names
    const movies: Movie[] = result.rows.map((row) => ({
      id: row.id || null,
      title_ja: row.title || "",           // title -> title_ja
      title_en: null,                       // Not available in this table
      description: row.overview || "",      // overview -> description
      release_year: row.release_date ? new Date(row.release_date).getFullYear() : null,
      rating: row.vote_average ? parseFloat(row.vote_average) : null,
      director: null,                       // Not available in this table
      actors: [],                           // Not available in this table
    }));

    const response = {
      movies,
      total: movies.length,
    };
    
    // Log search results summary
    if (movies.length > 0) {
      const titles = movies.slice(0, 3).map(m => m.title_ja).join(", ");
      const more = movies.length > 3 ? ` +${movies.length - 3} more` : "";
      log.debug(`✅ Found ${movies.length} movies: ${titles}${more}`);
    } else {
      log.debug(`❌ No movies found for query: "${query}"`);
    }
    
    setCachedResult(cacheKey, response);
    return response;
  } catch (error) {
    log.error("Movie search error:", error);
    // Return empty result on error (database might not be set up)
    return { movies: [], total: 0 };
  }
}
