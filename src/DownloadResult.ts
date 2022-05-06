import path from 'path';
import fs from 'fs';

import { DownloadEntry } from './DownloadEntry';
import { DownloadStatus } from './Enums/DownloadStatus';

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
   * The name of a downloaded file.
   */
  fileName: string;

  /**
   * The path of a downloaded file.
   */
  filePath: string | null = null;

  /**
   * @param entry A download entry.
   * @param buffer File data or null
   * @param status The download status.
   * @param rootPath The root path to the file folder.
   * @constructor
   */
  constructor(entry: DownloadEntry, status: DownloadStatus, buffer: Buffer | null, rootPath: string | null) {
    if (entry.id) this.id = entry.id;
    if (entry.url) this.url = entry.url;

    this.buffer = buffer;
    this.status = status;
    this.fileName = entry.fileName;

    if (rootPath) {
      this.filePath = path.resolve(rootPath, entry.fileName);
    }
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
    if (this.buffer && this.buffer.length > 0) return true;

    return !!this.filePath && fs.existsSync(this.filePath);
  }

  /**
   * Whether the file was deleted or not.
   */
  get isDeleted(): boolean {
    return this.isSuccessful && !this.fileExists;
  }
}
