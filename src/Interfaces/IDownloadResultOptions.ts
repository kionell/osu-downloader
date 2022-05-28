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
   * This buffer will store file data if file will be downloaded successfuly.
   */
  buffer?: Buffer | null;

  /**
   * The name of a downloaded file.
   */
  fileName?: string;

  /**
   * The path of a downloaded file.
   */
  filePath?: string;
}
