import { pool } from "./connection.js";
import type { Movie, MovieSearchResult } from "../types/index.js";

/**
 * Search movies by query, genre, and/or year
 */
export async function searchMovies(
  query: string,
  genre?: string,
  year?: number
): Promise<MovieSearchResult> {
  try {
    let sql = `
      SELECT         
        title, 
        overview, 
        genre, 
        release_date, 
        vote_average        
      FROM data_archive_movie_master
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Full-text search on title and description
    if (query) {
      sql += ` AND (
        title ILIKE $${paramIndex} 
        OR overview ILIKE $${paramIndex}
      )`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    // Filter by genre
    if (genre) {
      sql += ` AND $${paramIndex} = ANY(genre)`;
      params.push(genre);
      paramIndex++;
    }

    // Filter by year
    if (year) {
      sql += ` AND release_year = $${paramIndex}`;
      params.push(year);
      paramIndex++;
    }

    // Order by rating and limit results
    sql += ` ORDER BY rating DESC NULLS LAST LIMIT 10`;

    const result = await pool.query(sql, params);
    
    const movies: Movie[] = result.rows.map((row) => ({
      id: row.id,
      title_ja: row.title_ja,
      title_en: row.title_en,
      description: row.description,
      genre: row.genre || [],
      release_year: row.release_year,
      rating: row.rating ? parseFloat(row.rating) : null,
      director: row.director,
      actors: row.actors || [],
    }));

    return {
      movies,
      total: movies.length,
    };
  } catch (error) {
    console.error("Movie search error:", error);
    // Return empty result on error (database might not be set up)
    return { movies: [], total: 0 };
  }
}
