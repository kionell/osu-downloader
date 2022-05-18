import { DownloadResult } from './DownloadResult';

/**
 * Mapping for the files that are currently being processed.
 */
export class ProcessingMap extends Map<string, Promise<DownloadResult>> {
  /**
   * Adds a new element to the cache. Removes it after a certain time if needed.
   * @param filePath The key that will be used to identify this response.
   * @param promise The response value.
   * @returns Reference to this cache.
   */
  set(filePath: string, promise: Promise<DownloadResult>): this {
    super.set(filePath, promise);

    /**
     * Delete promise after resolve or reject.
     */
    Promise.resolve(promise).then(() => super.delete(filePath));

    return this;
  }
}
