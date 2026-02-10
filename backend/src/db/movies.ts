import type { Movie, MovieSearchResult } from "../types/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Movies");

const MOVIE_CACHE_TTL_MS = 2 * 60 * 1000;
const MOVIE_CACHE_LIMIT = 200;
const movieSearchCache = new Map<string, { value: MovieSearchResult; timestamp: number }>();

// OpenSearch API configuration
const OPENSEARCH_API_URL = "https://stg.opensearch.lovvit.jp/api/v1/movie/search";
const OPENSEARCH_API_KEY = "AKIAXN7E3HWLGDV4JNWN";

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
 * Search movies by query, genre, and/or year using OpenSearch API
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

    log.debug(`Movie search via API: "${query}"`);

    // Call OpenSearch API
    const response = await fetch(OPENSEARCH_API_URL, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": OPENSEARCH_API_KEY,
      },
      body: JSON.stringify({
        query: query || "",
        pagination: {
          page: 1,
          limit: 25,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Map API response to Movie interface
    // Adjust the mapping based on the actual API response structure
    const movies: Movie[] = (data.results || data.movies || []).map((item: any) => ({
      id: item.id || item.movie_id || null,
      title_ja: item.title_ja || item.title || "",
      title_en: item.title_en || null,
      description: item.description || item.overview || "",
      overview: item.overview || item.description || null,
      poster_path: item.poster_path || null,
      release_year: item.release_year || (item.release_date ? new Date(item.release_date).getFullYear() : null),
      rating: item.rating || item.vote_average || null,
      director: item.director || null,
      actors: item.actors || [],
    }));

    // Apply year filter if specified (client-side filtering)
    let filteredMovies = movies;
    if (year) {
      filteredMovies = movies.filter(m => m.release_year === year);
    }

    const result = {
      movies: filteredMovies,
      total: filteredMovies.length,
    };
    
    // Log search results summary
    if (filteredMovies.length > 0) {
      const titles = filteredMovies.slice(0, 3).map(m => m.title_ja).join(", ");
      const more = filteredMovies.length > 3 ? ` +${filteredMovies.length - 3} more` : "";
      log.debug(`✅ Found ${filteredMovies.length} movies: ${titles}${more}`);
    } else {
      log.debug(`❌ No movies found for query: "${query}"`);
    }
    
    setCachedResult(cacheKey, result);
    return result;
  } catch (error) {
    log.error("Movie search API error:", error);
    // Return empty result on error
    return { movies: [], total: 0 };
  }
}
