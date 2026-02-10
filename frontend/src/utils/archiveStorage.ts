/**
 * Archive Storage - FILO (First In Last Out) Stack
 * 
 * Manages archivable items (movies, gourmet) in a stack structure.
 * When assistant suggests items, they're pushed to the stack.
 * Commands like "save" pop from the stack (most recent item).
 */

import type { ArchiveItemInfo } from "@/types";
import { createLogger } from "./logger";

const log = createLogger("ArchiveStorage");
const STORAGE_KEY = "rabbit_archive_storage";

/**
 * Extended archive item with save status and friends matched
 */
export interface StoredArchiveItem extends ArchiveItemInfo {
  savedAt?: Date;
  friendsMatched?: Array<{ id: string; name: string }>;
}

/**
 * Archive storage class - manages FILO stack of archivable items
 */
class ArchiveStorage {
  private stack: StoredArchiveItem[] = [];
  private maxSize: number = 10; // Keep last 10 items
  private listeners: Set<() => void> = new Set();
  private cachedItems: StoredArchiveItem[] = []; // Cached getAll() result

  constructor() {
    this.loadFromStorage();
    this.updateCache();
  }

  /**
   * Load stack from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === "undefined") return; // SSR guard

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Restore Date objects (JSON.parse converts to string)
        this.stack = parsed.map((item: StoredArchiveItem) => ({
          ...item,
          savedAt: item.savedAt ? new Date(item.savedAt) : undefined,
        }));
        log.debug(`📂 Loaded ${this.stack.length} items from localStorage`);
      }
    } catch (error) {
      log.error("Failed to load from localStorage:", error);
      this.stack = [];
    }
  }

  /**
   * Save stack to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === "undefined") return; // SSR guard

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stack));
    } catch (error) {
      log.error("Failed to save to localStorage:", error);
    }
  }

  /**
   * Update cached items array (for useSyncExternalStore stability)
   */
  private updateCache(): void {
    this.cachedItems = [...this.stack].reverse();
  }

  /**
   * Push new item to stack (most recent)
   */
  push(item: ArchiveItemInfo): void {
    const storedItem: StoredArchiveItem = {
      ...item,
    };

    // Check if item already exists (by itemId and domain)
    const existingIndex = this.stack.findIndex(
      (i) => i.itemId === item.itemId && i.itemDomain === item.itemDomain
    );

    if (existingIndex >= 0) {
      // Remove existing and push to top (make it most recent)
      this.stack.splice(existingIndex, 1);
      log.debug(`♻️ Moving existing item to top: ${item.itemTitle}`);
    }

    this.stack.push(storedItem);
    log.debug(`📥 Pushed to storage: ${item.itemTitle} (${item.itemDomain}:${item.itemId})`);

    // Limit stack size
    if (this.stack.length > this.maxSize) {
      const removed = this.stack.shift();
      log.debug(`🗑️ Removed oldest item: ${removed?.itemTitle}`);
    }

    this.saveToStorage();
    this.updateCache();
    this.notifyListeners();
  }

  /**
   * Push multiple items to stack (batch operation)
   * More efficient than calling push() multiple times
   */
  pushMany(items: ArchiveItemInfo[]): void {
    if (items.length === 0) return;

    let addedCount = 0;
    let movedCount = 0;

    items.forEach((item) => {
      const storedItem: StoredArchiveItem = {
        ...item,
      };

      // Check if item already exists
      const existingIndex = this.stack.findIndex(
        (i) => i.itemId === item.itemId && i.itemDomain === item.itemDomain
      );

      if (existingIndex >= 0) {
        // Remove existing and push to top
        this.stack.splice(existingIndex, 1);
        movedCount++;
      } else {
        addedCount++;
      }

      this.stack.push(storedItem);
    });

    // Limit stack size (remove oldest items if needed)
    while (this.stack.length > this.maxSize) {
      const removed = this.stack.shift();
      log.debug(`🗑️ Removed oldest item: ${removed?.itemTitle}`);
    }

    log.debug(`📥 Batch pushed ${items.length} items (${addedCount} new, ${movedCount} moved)`);

    // Save and notify once after all items are added
    this.saveToStorage();
    this.updateCache();
    this.notifyListeners();
  }

  /**
   * Peek at the most recent item (without removing)
   */
  peek(): StoredArchiveItem | null {
    if (this.stack.length === 0) return null;
    return this.stack[this.stack.length - 1];
  }

  /**
   * Pop the most recent item (remove and return)
   */
  pop(): StoredArchiveItem | null {
    if (this.stack.length === 0) return null;
    const item = this.stack.pop()!;
    log.debug(`📤 Popped from storage: ${item.itemTitle}`);
    this.saveToStorage();
    this.updateCache();
    this.notifyListeners();
    return item;
  }

  /**
   * Get item by ID without removing
   */
  getById(itemId: string, domain: string): StoredArchiveItem | null {
    return (
      this.stack.find(
        (item) => item.itemId === itemId && item.itemDomain === domain
      ) || null
    );
  }

  /**
   * Update item (e.g., add friends matched after save)
   * If item doesn't exist, it will be created (for search results)
   */
  updateItem(
    itemId: string,
    domain: string,
    updates: Partial<StoredArchiveItem>
  ): void {
    const index = this.stack.findIndex(
      (item) => item.itemId === itemId && item.itemDomain === domain
    );

    if (index >= 0) {
      // Update existing item
      this.stack[index] = {
        ...this.stack[index],
        ...updates,
      };
      log.debug(`✏️ Updated item: ${this.stack[index].itemTitle}`, updates);
      this.saveToStorage();
      this.updateCache();
      this.notifyListeners();
    } else {
      // Item doesn't exist - create it if we have enough info
      // This happens when saving from search results that weren't pushed to stack
      if (updates.itemTitle && updates.itemDomain) {
        const newItem: StoredArchiveItem = {
          itemId,
          itemTitle: updates.itemTitle as string,
          itemDomain: domain as any,
          itemData: updates.itemData,
          savedAt: updates.savedAt,
          friendsMatched: updates.friendsMatched,
        };
        this.stack.push(newItem);
        log.debug(`📥 Created new item from update: ${newItem.itemTitle} (${domain}:${itemId})`);
        
        // Limit stack size
        if (this.stack.length > this.maxSize) {
          const removed = this.stack.shift();
          log.debug(`🗑️ Removed oldest item: ${removed?.itemTitle}`);
        }
        
        this.saveToStorage();
        this.updateCache();
        this.notifyListeners();
      } else {
        log.warn(`⚠️ Cannot update non-existent item without title: ${domain}:${itemId}`);
      }
    }
  }

  /**
   * Get all items (most recent first)
   * Returns cached array for useSyncExternalStore stability
   */
  getAll(): StoredArchiveItem[] {
    return this.cachedItems;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.stack = [];
    log.debug("🗑️ Cleared storage");
    this.saveToStorage();
    this.updateCache();
    this.notifyListeners();
  }

  /**
   * Get stack size
   */
  size(): number {
    return this.stack.length;
  }

  /**
   * Subscribe to storage changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// Singleton instance
const archiveStorage = new ArchiveStorage();

export default archiveStorage;
