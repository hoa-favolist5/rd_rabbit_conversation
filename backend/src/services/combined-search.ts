/**
 * Combined Search Service
 *
 * Runs database search and Google search in parallel,
 * then merges results for better movie coverage
 */

import { searchMovies } from "../db/movies.js";
import { searchGoogle, formatGoogleResults, type GoogleSearchResponse } from "./google-search.js";
import { createLogger } from "../utils/logger.js";
import type { MovieSearchResult } from "../types/index.js";

const log = createLogger("Search");

export interface CombinedSearchResult {
  dbResults: MovieSearchResult;
  googleResults: GoogleSearchResponse;
  merged: string; // Formatted for LLM consumption
}

/**
 * Search both database and Google in parallel
 *
 * @param query Search query
 * @param genre Optional genre filter (DB only)
 * @param year Optional year filter (DB only)
 * @returns Combined results from both sources
 */
export async function combinedMovieSearch(
  query: string,
  genre?: string,
  year?: number
): Promise<CombinedSearchResult> {
  log.debug(`🔍 Database search: "${query}"${genre ? ` genre:${genre}` : ""}${year ? ` year:${year}` : ""}`);

  const startTime = performance.now();

  // DISABLED: Google search - focus only on database
  // Run database search only
  const dbResults = await searchMovies(query, genre, year);
  
  // Empty Google results (disabled)
  const googleResults: GoogleSearchResponse = {
    results: [],
    total: 0,
    source: "google",
  };

  const duration = Math.round(performance.now() - startTime);

  // Format database results only
  const merged = formatCombinedResults(dbResults, googleResults);

  // Log detailed results summary
  if (dbResults.total > 0) {
    const topMovies = dbResults.movies.slice(0, 3).map(m => 
      `"${m.title_ja}"${m.release_year ? ` (${m.release_year})` : ""}`
    ).join(", ");
    log.debug(`✅ Database search complete: ${duration}ms | Found ${dbResults.total} results: ${topMovies}${dbResults.total > 3 ? ` +${dbResults.total - 3} more` : ""}`);
  } else {
    log.debug(`❌ Database search complete: ${duration}ms | No results found`);
  }

  return {
    dbResults,
    googleResults,
    merged,
  };
}

/**
 * Format combined results for LLM consumption
 * Database results only (Google search disabled)
 */
function formatCombinedResults(
  dbResults: MovieSearchResult,
  googleResults: GoogleSearchResponse
): string {
  const sections: string[] = [];

  // Database results section
  if (dbResults.movies.length > 0) {
    const dbMovies = dbResults.movies.slice(0, 5).map((m, i) => {
      const parts = [`${i + 1}. ${m.title_ja}`];
      if (m.release_year) parts.push(`(${m.release_year})`);
      if (m.rating) parts.push(`評価:${m.rating}`);
      if (m.director) parts.push(`監督:${m.director}`);
      if (m.description) {
        // Truncate description to 100 chars
        const desc = m.description.length > 100
          ? m.description.slice(0, 100) + "..."
          : m.description;
        parts.push(`\n   ${desc}`);
      }
      return parts.join(" ");
    });
    sections.push(`【データベース検索結果】\n${dbMovies.join("\n")}`);
    
    // Log what's being sent to LLM
    const titles = dbResults.movies.slice(0, 3).map(m => m.title_ja).join(", ");
    const more = dbResults.movies.length > 3 ? ` +${dbResults.movies.length - 3} more` : "";
    log.debug(`📤 Formatted ${dbResults.movies.length} results for LLM: ${titles}${more}`);
  } else {
    sections.push("【データベース検索結果】\n該当なし");
    log.debug(`📤 No results to format for LLM`);
  }

  // DISABLED: Google results section (focus only on database)
  // if (googleResults.results.length > 0) {
  //   sections.push(formatGoogleResults(googleResults));
  // }

  return sections.join("\n\n");
}

/**
 * Get just the MovieSearchResult for backward compatibility
 * (Returns DB results, but search was run in parallel with Google)
 */
export async function searchMoviesWithGoogle(
  query: string,
  genre?: string,
  year?: number
): Promise<MovieSearchResult> {
  const combined = await combinedMovieSearch(query, genre, year);
  return combined.dbResults;
}
