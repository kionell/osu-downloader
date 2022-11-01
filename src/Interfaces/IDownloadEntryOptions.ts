import { DownloadType } from '../Enums/DownloadType';

/**
 * Download entry options.
 */
export interface IDownloadEntryOptions {
  /**
   * Beatmap ID or beatmapset ID.
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
   * Type of this file.
   * @default DownloadType.Beatmap
   */
  type?: DownloadType;

  /**
   * Force file redownloading if it is already exists?
   * @default false
   */
  redownload?: boolean;

  /**
   * Should file be saved on a disk or not?
   * If you need to download a file and not to save it, you can choose false.
   * In that case all data will be stored in buffer of the download result.
   * @default true
   */
  save?: boolean;

  /**
   * MD5 hash for file validation.
   * If wasn't specified then file validation will be omitted.
   */
  md5?: string;
}
