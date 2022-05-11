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
  filesPerSecond?: number;

  /**
   * Should file downloading be synchronous or not?
   * It will overwrite files per second property.
   */
  synchronous?: boolean;
}
