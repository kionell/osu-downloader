export enum DownloadStatus {
  FailedToDownload = -3,
  WrongFileFormat = -2,
  FailedToWrite = -1,
  EmptyFile = 0,
  FileExists = 1,
  Downloaded = 2,
  Written = 3,
}
