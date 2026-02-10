/**
 * React Hook for Archive Storage - SINGLE SOURCE OF TRUTH
 *
 * FLOW:
 * 1. Movie suggested → push() to FILO storage
 * 2a. UI click → item from props → saveItem()
 * 2b. Text/Voice command → peek() newest → saveItem()
 * 3. API returns friend_matched → updateFriendsMatched() → auto re-render
 *
 * Provides reactive access to the archive storage (FILO stack).
 * Components using this hook will re-render when storage changes.
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import archiveStorage, { type StoredArchiveItem } from "@/utils/archiveStorage";
import type { DomainType, FriendMatch } from "@/types";

// ============================================================================
// MAIN HOOK - useArchiveStorage (single source of truth)
// ============================================================================

// Cached empty array for SSR - must be stable reference to avoid infinite loop
const EMPTY_ITEMS: StoredArchiveItem[] = [];

export interface UseArchiveStorageReturn {
  // State (auto re-renders on change)
  items: StoredArchiveItem[];

  // Helpers - check state without triggering API
  isSaved: (itemId: string, domain: DomainType) => boolean;
  getFriendsMatched: (itemId: string, domain: DomainType) => FriendMatch[];

  // Actions - modify storage (triggers re-render)
  markAsSaved: (itemId: string, domain: DomainType) => void;
  updateFriendsMatched: (itemId: string, domain: DomainType, friends: FriendMatch[]) => void;
}

/**
 * Main hook for archive storage with React 18 concurrent mode support
 */
export function useArchiveStorage(): UseArchiveStorageReturn {
  // Use useSyncExternalStore for proper React 18 integration
  // getServerSnapshot must return a cached value to avoid infinite loop
  const items = useSyncExternalStore(
    (callback) => archiveStorage.subscribe(callback),
    () => archiveStorage.getAll(),
    () => EMPTY_ITEMS // SSR: return stable empty array
  );

  const isSaved = useCallback((itemId: string, domain: DomainType): boolean => {
    const item = archiveStorage.getById(itemId, domain);
    return item?.savedAt !== undefined;
  }, []);

  const getFriendsMatched = useCallback((itemId: string, domain: DomainType): FriendMatch[] => {
    const item = archiveStorage.getById(itemId, domain);
    return item?.friendsMatched || [];
  }, []);

  const markAsSaved = useCallback((itemId: string, domain: DomainType) => {
    archiveStorage.updateItem(itemId, domain, { savedAt: new Date() });
  }, []);

  const updateFriendsMatched = useCallback((
    itemId: string,
    domain: DomainType,
    friends: FriendMatch[]
  ) => {
    archiveStorage.updateItem(itemId, domain, {
      savedAt: new Date(),
      friendsMatched: friends,
    });
  }, []);

  return {
    items,
    isSaved,
    getFriendsMatched,
    markAsSaved,
    updateFriendsMatched,
  };
}

// ============================================================================
// LEGACY HOOKS (for backwards compatibility)
// ============================================================================

/**
 * Hook to get the most recent archivable item
 */
export function useLatestArchiveItem(): StoredArchiveItem | null {
  const [item, setItem] = useState<StoredArchiveItem | null>(
    archiveStorage.peek()
  );

  useEffect(() => {
    const unsubscribe = archiveStorage.subscribe(() => {
      setItem(archiveStorage.peek());
    });
    return unsubscribe;
  }, []);

  return item;
}

/**
 * Hook to get all archive items (most recent first)
 */
export function useAllArchiveItems(): StoredArchiveItem[] {
  const [items, setItems] = useState<StoredArchiveItem[]>(
    archiveStorage.getAll()
  );

  useEffect(() => {
    const unsubscribe = archiveStorage.subscribe(() => {
      setItems(archiveStorage.getAll());
    });
    return unsubscribe;
  }, []);

  return items;
}

/**
 * Hook to get archive storage size
 */
export function useArchiveStorageSize(): number {
  const [size, setSize] = useState<number>(archiveStorage.size());

  useEffect(() => {
    const unsubscribe = archiveStorage.subscribe(() => {
      setSize(archiveStorage.size());
    });
    return unsubscribe;
  }, []);

  return size;
}
