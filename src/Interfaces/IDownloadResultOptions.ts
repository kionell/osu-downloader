import { DownloadEntry } from '../DownloadEntry';
import { DownloadStatus } from '../Enums/DownloadStatus';

/**
 * Download result options.
 */
export interface IDownloadResultOptions {
  /**
   * Entry that was processed.
   */
  entry: DownloadEntry;

  /**
   * Status of the downloading.
   */
  status: DownloadStatus;

  /**
   * MD5 hash of a file or buffer.
   */
  md5?: string | null;

  /**
   * This buffer will store file data if file will be downloaded successfuly.
   */
  buffer?: Buffer | null;

  /**
   * Root path of the downloader.
   */
  rootPath?: string | null;
}
