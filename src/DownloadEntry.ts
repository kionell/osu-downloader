import SparkMD5 from 'spark-md5';
import { DownloadType } from './Enums/DownloadType';
import { IDownloadEntryOptions } from './Interfaces/IDownloadEntryOptions';

/**
 * A downloader entry which can be added to the queue.
 */
export class DownloadEntry {
  /**
   * A beatmap or beatmapset ID to download.
   */
  id?: string | number;

  /**
   * Custom URL to download this file.
   */
  url?: string;

  /**
   * Custom file name which will be used to save this file.
   */
  customName?: string;

  /**
   * A type of file which will be downloaded.
   */
  type: DownloadType = DownloadType.Beatmap;

  /**
   * Can be used to force redownload of this file.
   */
  redownload = false;

  /**
   * Should file be saved on a disk or not?
   * If you need to download a file and not to save it, you can choose false.
   * In that case all data will be stored in buffer of the download result.
   */
  save = true;

  /**
   * Creates a new download entry.
   * @param options Download entry options.
   * @constructor
   */
  constructor(options?: IDownloadEntryOptions) {
    this.id = options?.id ?? this.id;
    this.url = options?.url ?? this.url;
    this.customName = options?.customName ?? this.customName;
    this.type = options?.type ?? this.type;
    this.redownload = options?.redownload ?? this.redownload;
    this.save = options?.save ?? this.save;
  }

  get isArchive(): boolean {
    return this.type === DownloadType.Set;
  }

  get file(): string | null {
    if (typeof this.customName === 'string') {
      if (this.customName.length > 0) return this.customName;
    }

    const hasStringId = typeof this.id === 'string' && this.id;
    const hasNumberId = typeof this.id === 'number' && this.id > 0;

    if (hasStringId || hasNumberId) {
      return (this.id as number).toString();
    }

    if (typeof this.url === 'string') {
      if (this.url.length > 0) return SparkMD5.hash(this.url);
    }

    return null;
  }

  get fileExtension(): string {
    switch (this.type) {
      case DownloadType.Set: return 'osz';
      case DownloadType.Replay: return 'osr';
    }

    return 'osu';
  }

  get fileName(): string | null {
    if (!this.file) return null;

    return `${this.file}.${this.fileExtension}`;
  }
}
