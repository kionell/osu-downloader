export enum DownloadStatus {
  FailedToDownload = -3,
  FailedToRead = -2,
  FailedToWrite = -1,
  AlreadyInProcess = 0,
  FileExists = 1,
  Downloaded = 2,
  Written = 3,
}
