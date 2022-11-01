/**
 * Downloader options.
 */
export interface IDownloaderOptions {
  /**
   * A path for saving beatmaps.
   * @default "./cache"
   */
  rootPath?: string;

  /**
   * How many files per second will be downloaded. (0 - unlimited).
   * @default 0
   */
  filesPerSecond?: number;

  /**
   * Should file downloading be synchronous or not?
   * @default true
   */
  synchronous?: boolean;
}
