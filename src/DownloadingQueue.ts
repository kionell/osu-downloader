import { DownloadEntry } from './DownloadEntry';

/**
 * A downloading queue.
 */
export class DownloadingQueue {
  /**
   * Entries of this queue.
   */
  private _entries: DownloadEntry[] = [];

  /**
   * Whether the queue is empty or not.
   */
  get isEmpty(): boolean {
    return this._entries.length === 0;
  }

  /**
   * The number of entries in the queue.
   */
  get count(): number {
    return this._entries.length;
  }

  /**
   * Retrieves and entry at an index in the queue.
   * @param index The index of the item to retrieve.
   * @returns The found entry.
   */
  get(index: number): DownloadEntry {
    if (index < 0 || index > this._entries.length) {
      throw new Error('Index is out of range!');
    }

    return this._entries[index];
  }

  /**
   * Add a new entry to the queue.
   * @param entry A new entry to be added.
   */
  enqueue(entry: DownloadEntry): void {
    this._entries.push(entry);
  }

  /**
   * Removes an entry from the queue.
   * @returns The removed entry.
   */
  dequeue(): DownloadEntry {
    const entry = this._entries.shift();

    if (!entry) {
      throw new Error('The queue is empty!');
    }

    return entry;
  }

  /**
   * Removes all entries from the queue.
   */
  clear(): void {
    this._entries = [];
  }
}
