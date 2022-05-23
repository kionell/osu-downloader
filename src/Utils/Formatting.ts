import { DownloadStatus } from '../Enums';

/**
 * Converts download status to a readable string.
 * @param status Download status.
 * @returns Readable download status.
 */
export function formatDownloadStatus(status: DownloadStatus): string {
  switch (status) {
    case DownloadStatus.FailedToDownload:
      return 'Not Found';

    case DownloadStatus.WrongFileFormat:
      return 'Wrong File Format';

    case DownloadStatus.FailedToWrite:
      return 'Failed To Write';

    case DownloadStatus.EmptyFile:
      return 'File is empty';

    case DownloadStatus.FileExists:
      return 'Already Exists';

    case DownloadStatus.Downloaded:
      return 'Downloaded Successfuly';

    case DownloadStatus.Written:
      return 'Written Successfuly';

    default:
      return 'Unknown status';
  }
}
