export enum DownloadStatus {
  FailedToDownload = -2,
  FailedToRead = -1,
  FailedToWrite = 0,
  FileExists = 1,
  Downloaded = 2,
  Written = 3,
}
