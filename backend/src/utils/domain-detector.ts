import type { DomainType } from "../types/index.js";
import { MOVIE_KEYWORDS, GOURMET_KEYWORDS } from "../constants/keywords.js";

/**
 * Detect conversation domain from user message
 * This helps contextualize conversation history retrieval
 */
export function detectDomain(message: string): DomainType {
  const lowerMessage = message.toLowerCase();

  // Count matches for each domain
  let movieScore = 0;
  let gourmetScore = 0;

  for (const keyword of MOVIE_KEYWORDS) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      movieScore++;
    }
  }

  for (const keyword of GOURMET_KEYWORDS) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      gourmetScore++;
    }
  }

  // Determine domain based on scores
  if (movieScore > gourmetScore) {
    return "movie";
  } else if (gourmetScore > movieScore) {
    return "gourmet";
  } else {
    // Default to general if no clear domain
    return "general";
  }
}

/**
 * Detect domain from conversation history
 * Uses the most recent domain-specific messages to determine context
 */
export function detectDomainFromHistory(
  messages: Array<{ content: string }>
): DomainType {
  if (messages.length === 0) {
    return "general";
  }

  // Check recent messages (last 3)
  const recentMessages = messages.slice(-3);
  const domains = recentMessages.map((msg) => detectDomain(msg.content));

  // Count domain occurrences
  const domainCounts: Record<DomainType, number> = {
    movie: 0,
    gourmet: 0,
    general: 0,
  };

  for (const domain of domains) {
    domainCounts[domain]++;
  }

  // Return most frequent domain (excluding general)
  if (domainCounts.movie > domainCounts.gourmet) {
    return "movie";
  } else if (domainCounts.gourmet > domainCounts.movie) {
    return "gourmet";
  } else if (domainCounts.movie > 0 || domainCounts.gourmet > 0) {
    // If there's a tie but at least one specific domain, prefer movie
    return domainCounts.movie > 0 ? "movie" : "gourmet";
  }

  return "general";
}
