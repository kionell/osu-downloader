import { DownloadTypes } from './Enums/DownloadTypes';

/**
 * A downloader entry which can be added to the queue.
 */
export class DownloadEntry {
  /**
   * Regular expression to validate IDs.
   */
  static NUM_REGEX = /^\d+$/;

  /**
   * A beatmap or beatmapset ID to download.
   */
  id: string | number = 0;

  /**
   * A type of file which will be downloaded.
   */
  type: DownloadTypes = DownloadTypes.Beatmap;

  /**
   * @param id A beatmap or beatmapset ID.
   * @param mirror A server for downloading files.
   * @constructor
   */
  constructor(id: string | number, type?: DownloadTypes) {
    if (!DownloadEntry.NUM_REGEX.test(id.toString())) {
      throw new Error(`Wrong ID! ID: ${id}`);
    }

    if (type) this.type = type;

    this.id = id;
  }

  get isArchive(): boolean {
    return this.type === DownloadTypes.Set;
  }

  get file(): string {
    return this.id.toString();
  }

  get fileExtension(): string {
    return this.isArchive ? 'osz' : 'osu';
  }

  get fileName(): string {
    return `${this.file}.${this.fileExtension}`;
  }
}
