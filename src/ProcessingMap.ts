import { DownloadResult } from './DownloadResult';

/**
 * Mapping for the files that are currently being processed.
 */
export class ProcessingMap extends Map<string, Promise<DownloadResult>> {
  /**
   * Adds a new element to the map.
   * @param taskId Task ID that used to identify current entry.
   * @param promise Promise with download result.
   * @returns Reference to this map.
   */
  set(taskId: string, promise: Promise<DownloadResult>): this {
    super.set(taskId, promise);

    /**
     * Delete promise after resolve or reject.
     */
    Promise.resolve(promise).then(() => super.delete(taskId));

    return this;
  }
}
