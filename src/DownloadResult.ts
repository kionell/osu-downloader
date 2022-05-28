import { resolve } from 'path';
import { DownloadStatus } from './Enums/DownloadStatus';
import { IDownloadResultOptions } from './Interfaces/IDownloadResultOptions';
import { formatDownloadStatus } from './Utils';

/**
 * A result of downloading a beatmap.
 */
export class DownloadResult {
  /**
   * A beatmap or beatmapset ID which was processed.
   */
  id?: string | number;

  /**
   * Custom URL which was processed.
   */
  url?: string;

  /**
   * This buffer will store file data in case 
   * if the user decides not to save it on a disk.
   */
  buffer: Buffer | null;

  /**
   * Status of the downloading.
   */
  status: DownloadStatus;

  /**
   * Readable download status.
   */
  statusText: string;

  /**
   * The name of a downloaded file.
   */
  fileName: string | null = null;

  /**
   * The path of a downloaded file.
   */
  filePath: string | null = null;

  /**
   * MD5 hash of a file or buffer.
   */
  md5: string | null = null;

  /**
   * @param options Download result options.
   * @constructor
   */
  constructor(options: IDownloadResultOptions) {
    const { entry, status, md5, buffer, rootPath } = options;

    if (entry.id) this.id = entry.id;
    if (entry.url) this.url = entry.url;

    this.status = status;
    this.statusText = formatDownloadStatus(status);
    this.fileName = entry.fileName;

    if (!this.fileName && md5) {
      this.fileName = md5 + '.' + entry.fileExtension;
    }

    if (rootPath && this.fileName) {
      this.filePath = resolve(rootPath, this.fileName);
    }

    this.buffer = buffer ?? null;
    this.md5 = md5 ?? null;
  }

  /**
   * Whether the result was successful or not. 
   */
  get isSuccessful(): boolean {
    return this.status > 0;
  }

  /**
   * Do file exists or not?
   */
  get fileExists(): boolean {
    return !!this.filePath || !!this.buffer?.length;
  }
}
