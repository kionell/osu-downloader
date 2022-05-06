/**
 * Downloader options.
 */
export interface IDownloaderOptions {
  /**
   * A path for saving beatmaps.
   */
  rootPath?: string;

  /**
   * How many beatmaps per second will be downloaded. (0 - synchronous downloading).
   */
  beatmapsPerSecond?: number;
}
