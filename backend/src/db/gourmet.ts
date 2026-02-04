import type { GourmetRestaurant, GourmetSearchResult } from "../types/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Gourmet");

const GOURMET_CACHE_TTL_MS = 2 * 60 * 1000;
const GOURMET_CACHE_LIMIT = 200;
const gourmetSearchCache = new Map<string, { value: GourmetSearchResult; timestamp: number }>();

// OpenSearch API configuration
const OPENSEARCH_API_URL = "https://stg.opensearch.lovvit.jp/api/v1/restaurant/search";
const OPENSEARCH_API_KEY = "AKIAXN7E3HWLGDV4JNWN";

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
 * Search gourmet restaurants by query, area, and/or cuisine type using OpenSearch API
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

    log.debug(`Gourmet search via API: query="${query}", area="${area || ""}", cuisine="${cuisine || ""}"`);

    // Build search query combining all search parameters
    let searchQuery = query || "";
    if (area) {
      searchQuery = searchQuery ? `${searchQuery} ${area}` : area;
    }
    if (cuisine) {
      searchQuery = searchQuery ? `${searchQuery} ${cuisine}` : cuisine;
    }

    // Call OpenSearch API
    const response = await fetch(OPENSEARCH_API_URL, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": OPENSEARCH_API_KEY,
      },
      body: JSON.stringify({
        query: searchQuery,
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

    // Map API response to GourmetRestaurant interface
    // Adjust the mapping based on the actual API response structure
    const restaurants: GourmetRestaurant[] = (data.results || data.restaurants || []).map((item: any) => ({
      id: item.id || null,
      code: item.code || null,
      name: item.name || "",
      name_short: item.name_short || item.nameShort || null,
      address: item.address || null,
      lat: item.lat || item.latitude ? parseFloat(item.lat || item.latitude) : null,
      lng: item.lng || item.longitude ? parseFloat(item.lng || item.longitude) : null,
      catch_copy: item.catch_copy || item.catchCopy || null,
      capacity: item.capacity || null,
      access: item.access || null,
      urls_pc: item.urls_pc || item.urlsPc || item.url || null,
      open_hours: item.open_hours || item.openHours || null,
      close_days: item.close_days || item.closeDays || null,
      budget_id: item.budget_id || item.budgetId || null,
    }));

    // Apply client-side filtering if needed
    let filteredRestaurants = restaurants;
    
    // Filter by area if specified (check if address contains area)
    if (area && area.trim().length > 0) {
      filteredRestaurants = filteredRestaurants.filter(r => 
        r.address?.toLowerCase().includes(area.toLowerCase())
      );
    }
    
    // Filter by cuisine if specified (check if name or catch_copy contains cuisine)
    if (cuisine && cuisine.trim().length > 0) {
      filteredRestaurants = filteredRestaurants.filter(r => 
        r.name?.toLowerCase().includes(cuisine.toLowerCase()) ||
        r.catch_copy?.toLowerCase().includes(cuisine.toLowerCase())
      );
    }

    const result = {
      restaurants: filteredRestaurants,
      total: filteredRestaurants.length,
    };
    
    // Log search results summary
    if (filteredRestaurants.length > 0) {
      const names = filteredRestaurants.slice(0, 3).map(r => r.name).join(", ");
      const more = filteredRestaurants.length > 3 ? ` +${filteredRestaurants.length - 3} more` : "";
      log.debug(`✅ Found ${filteredRestaurants.length} restaurants: ${names}${more}`);
    } else {
      log.debug(`❌ No restaurants found for query: "${query}"`);
    }
    
    setCachedResult(cacheKey, result);
    return result;
  } catch (error) {
    log.error("Gourmet search API error:", error);
    // Return empty result on error
    return { restaurants: [], total: 0 };
  }
}
