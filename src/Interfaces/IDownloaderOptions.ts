/**
 * Downloader options.
 */
export interface IDownloaderOptions {
  /**
   * A path for saving beatmaps.
   */
  rootPath?: string;

  /**
   * How many files per second will be downloaded. (0 - unlimited).
   */
  filesPerSecond?: number | null;
}
