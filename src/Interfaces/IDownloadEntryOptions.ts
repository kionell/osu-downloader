import { DownloadTypes } from '../Enums/DownloadTypes';

export interface IDownloadEntryOptions {
  type?: DownloadTypes;
  redownload?: boolean;
}
