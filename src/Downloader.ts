import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Bottleneck from 'bottleneck';
import { Readable } from 'stream';

import { DownloadingQueue } from './DownloadingQueue';
import { DownloadResult } from './DownloadResult';
import { DownloadEntry } from './DownloadEntry';
import { DownloadStatus } from './Enums/DownloadStatus';
import { DownloadType } from './Enums/DownloadType';
import { LinkGenerator } from './Utils/LinkGenerator';
import { IDownloaderOptions } from './Interfaces/IDownloaderOptions';
import { ProcessingMap } from './ProcessingMap';

/**
 * A file downloader.
 */
export class Downloader {
  /**
   * Mapping for the files that are currently being processed.
   */
  protected static _processed: ProcessingMap = new ProcessingMap();

  /**
   * The queue of downloading maps.
   */
  protected _queue: DownloadingQueue = new DownloadingQueue();

  /**
   * A root path for saving files.
   */
  protected _rootPath: string | null = null;

  /**
   * A rate limiter to prevent big amount of requests.
   */
  protected _limiter: Bottleneck;

  /**
   * The number of the current downloading file.
   */
  currentFile = 0;

  /**
   * Total amount of files at the start of downloading.
   */
  totalFiles = 0;

  /**
   * @param options Downloader options.
   * @constructor
   */
  constructor({ rootPath, filesPerSecond, synchronous }: IDownloaderOptions) {
    if (typeof rootPath === 'string') {
      this._rootPath = path.normalize(rootPath);

      fs.mkdirSync(this._rootPath, { recursive: true });
    }

    this._limiter = new Bottleneck({
      reservoir: 60,
      reservoirRefreshAmount: 60,
      reservoirRefreshInterval: 60 * 1000,
      maxConcurrent: synchronous !== false ? 1 : null,
      minTime: filesPerSecond
        ? Math.max(0, 1000 / filesPerSecond) : 0,
    });
  }

  get progress(): number {
    if (this.totalFiles === 0) return 0;

    return this.currentFile / this.totalFiles;
  }

  /**
   * Cancels current downloader work.
   */
  reset(): void {
    this._queue.clear();
    this.currentFile = 0;
    this.totalFiles = 0;
  }

  /**
   * Adds a single entry to the downloader's queue.
   * @param input ID or download entry.
   * @returns The number of entries in the queue.
   */
  addSingleEntry(input: string | number | DownloadEntry): number {
    if (this._queue.isEmpty) this.reset();

    const entry = input instanceof DownloadEntry
      ? input : new DownloadEntry({ id: input });

    this._queue.enqueue(entry);

    this.totalFiles = Math.max(this.totalFiles, this._queue.count);

    return this._queue.count;
  }

  /**
   * Adds multiple entries to the downloader's queue.
   * @param inputs The entries to be added.
   * @returns The number of entries in the queue.
   */
  addMultipleEntries(inputs: (string | number | DownloadEntry)[]): number {
    if (this._queue.isEmpty) this.reset();

    if (!Array.isArray(inputs)) {
      return this._queue.count;
    }

    inputs?.map((input) => this.addSingleEntry(input)) ?? [];

    return this._queue.count;
  }

  /**
   * Downloads every file from the queue. 
   * By default it saves all files on a disk and resulting buffer will be null.
   * If file is already exists or failed to write the buffer will also be null.
   * @returns Download results.
   */
  async downloadAll(): Promise<DownloadResult[]> {
    const results = [];

    while (!this._queue.isEmpty) {
      results.push(this.downloadSingle());
    }

    return Promise.all(results);
  }

  /**
   * Downloads a single file from the queue with expected rate limit. 
   * By default it saves all files on a disk and resulting buffer will be null.
   * If file is already exists or failed to write the buffer will also be null.
   * @returns Download result.
   */
  async downloadSingle(): Promise<DownloadResult> {
    const entry = this._queue.dequeue();
    const filePath = this._getFilePath(entry);

    /** 
     * Check if file is being processed through another entry.
     * If this entry has file path and currently is being processed
     * then we will return saved promise to its download result. 
     */
    if (filePath && Downloader._processed.has(filePath)) {
      return Downloader._processed.get(filePath) as Promise<DownloadResult>;
    }

    /**
     * Wrap this into async function to leave await 
     * for the next iteration of the event loop.
     */
    const task = async() => {
      if (await this._checkFileValidity(entry)) {
        return this._generateResult(entry, DownloadStatus.FileExists);
      }

      return this._limiter.schedule(() => this._download(entry));
    };

    /**
     * Now we can call this task and add it to the processing map immediately.
     * This code below must be executed in the same iteration of the event loop!
     */
    const promise = task();

    if (filePath) {
      Downloader._processed.set(filePath, promise);
    }

    return promise;
  }

  private async _download(entry: DownloadEntry): Promise<DownloadResult> {
    const readable = await this._requestFile(entry);

    if (!readable?.readable) {
      return this._generateResult(entry, DownloadStatus.FailedToDownload);
    }

    if (this._rootPath && entry.save) {
      const status = await this._tryToSaveFile(readable, entry);

      return this._generateResult(entry, status);
    }

    const buffer = await this._tryToGetBuffer(readable);

    const isValid = this._validateFileFormat(buffer, entry.type);
    const status = isValid
      ? DownloadStatus.Downloaded
      : DownloadStatus.WrongFileFormat;

    return this._generateResult(entry, status, buffer);
  }

  /**
   * Requests a file from the download entry using the rate limiter.
   * @param entry A download entry.
   * @returns Readable stream.
   */
  private async _requestFile(entry: DownloadEntry): Promise<Readable | null> {
    const links = this._getRequestLinks(entry);

    for (const link of links) {
      try {
        const response = await axios({
          url: link,
          responseType: 'stream',
          headers: {
            'Accept': 'application/octet-stream',
            'Content-Type': 'application/octet-stream',
          },
        });

        if (response.status >= 200 && response.status < 300) {
          return response.data;
        }
      }
      catch {
        continue;
      }
    }

    return null;
  }

  private async _tryToGetBuffer(readable: Readable): Promise<Buffer | null> {
    const chunks = [];

    try {
      for await (const chunk of readable) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    }
    catch {
      return null;
    }
  }

  private async _tryToSaveFile(readable: Readable, entry: DownloadEntry): Promise<DownloadStatus> {
    const filePath = this._getFilePath(entry);
    const fileType = entry.type;

    if (!filePath) return DownloadStatus.FailedToWrite;

    return new Promise((res) => {
      const writable = fs.createWriteStream(filePath);

      readable.once('data', (chunk) => {
        if (this._validateFileFormat(chunk, fileType)) return;

        fs.unlink(filePath, () => res(DownloadStatus.WrongFileFormat));

        writable.close();
        readable.destroy();
      });

      writable.once('error', () => {
        fs.unlink(filePath, () => res(DownloadStatus.FailedToWrite));
      });

      writable.once('finish', () => {
        writable.bytesWritten > 0
          ? res(DownloadStatus.Written)
          : fs.unlink(filePath, () => res(DownloadStatus.EmptyFile));

        writable.close();
        readable.destroy();
      });

      readable.pipe(writable);
    });
  }

  /**
   * Generates a new download result.
   * @param entry Current download entry.
   * @param status Status of a download result.
   * @param data File data or null.
   * @returns Download result.
   */
  private _generateResult(entry: DownloadEntry, status: DownloadStatus, data: Buffer | null = null): DownloadResult {
    // Increment current file counter.
    this.currentFile++;

    return new DownloadResult(entry, status, data, this._rootPath);
  }

  /**
   * Generates request link by corresponding download entry.
   * @param entry A download entry.
   * @returns Generated request link.
   */
  private _getRequestLinks(entry: DownloadEntry): string[] {
    const links = [];

    // Prioritize custom URL.
    if (entry.url) links.push(entry.url);

    if (entry.id) {
      const generator = new LinkGenerator(entry.type, entry.id);
      const additional = generator.generate();

      links.push(...additional);
    }

    return links;
  }

  /**
   * Generates absolute file path to the downloaded file.
   * @param entry A download entry.
   * @returns Absolute file path.
   */
  private _getFilePath(entry: DownloadEntry): string | null {
    if (!this._rootPath) return null;

    return path.join(this._rootPath, entry.fileName);
  }

  /**
   * Checks if file exists or isn't empty.
   * @param entry The download entry.
   * @returns Whether the file is valid
   */
  private async _checkFileValidity(entry: DownloadEntry): Promise<boolean> {
    const filePath = this._getFilePath(entry);

    if (!filePath) return false;

    /**
     * Invalidate file if it requires redownloading.
     */
    if (entry.redownload) return false;

    try {
      const buffer = Buffer.alloc(20);
      const fsPromise = fs.promises;

      const file = await fsPromise.open(filePath, 'r');

      // Read 21 bytes with possible 3 bytes of BOM.
      await file.read(buffer, 0, 20);
      await file.close();

      return this._validateFileFormat(buffer, entry.type);
    }
    catch {
      return false;
    }
  }

  /**
   * Checks the specified chunk of the file and checks if the format is valid.
   * @param chunk Target chunk or null.
   * @param type File type.
   * @returns If the file format is correct.
   */
  private _validateFileFormat(chunk: Buffer | null, type: DownloadType): boolean {
    if (!chunk) return false;

    if (type !== DownloadType.Beatmap) {
      return chunk.length > 0;
    }

    if (chunk.length < 17) return false;

    const hasBOM = chunk[0] === 239 && chunk[1] === 187 && chunk[2] === 191;
    const offset = hasBOM ? 3 : 0;

    const string = chunk.slice(offset, 17 + offset).toString();

    return string.startsWith('osu file format v');
  }
}
