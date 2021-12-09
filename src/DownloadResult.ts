import path from 'path';
import fs from 'fs';

import { DownloadEntry } from './DownloadEntry';
import { DownloadStatuses } from './Enums/DownloadStatuses';

/**
 * A result of downloading a beatmap.
 */
export class DownloadResult {
  /**
   * A beatmap or beatmapset ID which was processed.
   */
  id: string | number;

  /**
   * Status of the downloading.
   */
  status: DownloadStatuses;

  /**
   * The name of a downloaded file.
   */
  fileName: string;

  /**
   * The path of a downloaded file.
   */
  filePath: string;

  /**
   * @param entry A download entry.
   * @param status The download status.
   * @param rootPath The root path to the file folder.
   * @constructor
   */
  constructor(entry: DownloadEntry, status: DownloadStatuses, rootPath: string) {
    this.id = entry.id.toString();
    this.status = status;
    this.fileName = entry.fileName;
    this.filePath = path.resolve(rootPath, entry.fileName);
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
    return fs.existsSync(this.filePath);
  }

  /**
   * Whether the file was deleted or not.
   */
  get isDeleted(): boolean {
    return this.isSuccessful && !this.fileExists;
  }
}
