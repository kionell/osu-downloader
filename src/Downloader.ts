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

/**
 * A file downloader.
 */
export class Downloader {
  /**
   * The queue of downloading maps.
   */
  protected _queue: DownloadingQueue = new DownloadingQueue();

  /**
   * List of valid files.
   */
  protected _validFiles: Set<string> = new Set();

  /**
   * List of entries that are currently being processed.
   */
  protected _processedEntries: Set<string> = new Set();

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
   * @param rootPath A path for saving files.
   * @param filesPerSecond How many files per second will be downloaded. (0 - unlimited).
   * @constructor
   */
  constructor({ rootPath, filesPerSecond }: IDownloaderOptions) {
    if (typeof rootPath === 'string') {
      this._rootPath = path.normalize(rootPath);

      fs.mkdirSync(this._rootPath, { recursive: true });
    }

    if (typeof filesPerSecond !== 'number' || filesPerSecond <= 0) {
      filesPerSecond = null;
    }

    this._limiter = new Bottleneck({
      maxConcurrent: filesPerSecond,
      minTime: 1000,
    });
  }

  get progress(): number {
    if (this.totalFiles === 0) return 0;

    return this.currentFile / this.totalFiles;
  }

  /**
   * Adds a single entry to the downloader's queue.
   * @param input ID or download entry.
   * @returns The number of entries in the queue.
   */
  async addSingleEntry(input: string | number | DownloadEntry): Promise<number> {
    if (this._queue.isEmpty) this.reset();

    const entry = input instanceof DownloadEntry
      ? input : new DownloadEntry({ id: input });

    if (entry.save && await this._checkFileValidity(entry)) {
      this._validFiles.add(entry.fileName);
    }

    this._queue.enqueue(entry);

    this.totalFiles = Math.max(this.totalFiles, this._queue.count);

    return this._queue.count;
  }

  /**
   * Adds multiple entries to the downloader's queue.
   * @param inputs The entries to be added.
   * @returns The number of entries in the queue.
   */
  async addMultipleEntries(inputs: (string | number | DownloadEntry)[]): Promise<number> {
    if (this._queue.isEmpty) this.reset();

    if (!Array.isArray(inputs)) {
      return this._queue.count;
    }

    const tasks = inputs?.map((input) => this.addSingleEntry(input)) ?? [];

    await Promise.all(tasks);

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
    const count = this._queue.count;

    for (let i = 0; i < count; ++i) {
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
    return this._limiter.schedule(() => this._download());
  }

  private async _download(): Promise<DownloadResult> {
    const entry = this._queue.dequeue();

    /**
     * Check if file is being processed through another entry.
     */
    if (!this._checkAvailability(entry)) {
      return this._generateResult(entry, DownloadStatus.AlreadyInProcess);
    }

    /**
     * Check if file is already downloaded.
     */
    if (this._rootPath && entry.save && await this._checkFileValidity(entry)) {
      return this._generateResult(entry, DownloadStatus.FileExists);
    }

    const readable = await this._requestFile(entry);

    if (!readable?.readable) {
      return this._generateResult(entry, DownloadStatus.FailedToDownload);
    }

    if (this._rootPath && entry.save) {
      const isWritten = await this._tryToSaveFile(readable, entry);
      const status = isWritten
        ? DownloadStatus.Written
        : DownloadStatus.FailedToWrite;

      return this._generateResult(entry, status);
    }

    const buffer = await this._tryToGetBuffer(readable);

    const isValid = this._validateBuffer(buffer, entry.type);
    const status = isValid
      ? DownloadStatus.Downloaded
      : DownloadStatus.FailedToRead;

    return this._generateResult(entry, status, buffer);
  }

  /**
   * Cancels the current downloader work.
   */
  reset(): void {
    this._queue.clear();
    this._validFiles.clear();
    this._processedEntries.clear();
    this.currentFile = 0;
    this.totalFiles = 0;
  }

  /**
   * Requests a file from the download entry using the rate limiter.
   * @param entry A download entry.
   * @returns Readable stream.
   */
  private async _requestFile(entry: DownloadEntry): Promise<Readable | null> {
    /**
     * Block current file to prevent downloading from multiple entries.
     */
    if (this._checkAvailability(entry)) {
      this._processedEntries.add(entry.fileName);
    }

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

        if (response.status === 200) return response.data;
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

  private async _tryToSaveFile(readable: Readable, entry: DownloadEntry): Promise<boolean> {
    const filePath = this._getFilePath(entry);

    if (!filePath) return false;

    const writable = fs.createWriteStream(filePath);

    return new Promise((res) => {
      writable.on('error', () => res(false));

      writable.on('finish', () => {
        res(writable.bytesWritten > 0);

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
    /**
     * We don't want to check the files that already present in the list.
     */
    if (this._validFiles.has(entry.fileName)) {
      return true;
    }

    /**
     * Invalidate file if it requires redownloading.
     */
    if (entry.redownload) return false;

    const filePath = this._getFilePath(entry);

    if (!filePath) return false;

    try {
      const buffer = Buffer.alloc(20);
      const fsPromise = fs.promises;

      const file = await fsPromise.open(filePath, 'r');

      // Read 21 bytes with possible 3 bytes of BOM.
      await file.read(buffer, 0, 20);
      await file.close();

      return this._validateBuffer(buffer, entry.type);
    }
    catch {
      return false;
    }
  }

  /**
   * Checks if this buffer is valid or not.
   * @param buffer Target buffer or null.
   * @param type File type.
   * @returns If this buffer valid or not.
   */
  private _validateBuffer(buffer: Buffer | null, type: DownloadType): boolean {
    if (!buffer) return false;

    if (type !== DownloadType.Beatmap) {
      return buffer.length > 0;
    }

    if (buffer.length < 17) return false;

    const hasBOM = buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191;
    const offset = hasBOM ? 3 : 0;

    const string = buffer.slice(offset, 17 + offset).toString();

    return string.startsWith('osu file format v');
  }

  /**
   * Checks if file is available to download from this entry.
   * @param entry The download entry.
   * @returns Whether the file is available to download
   */
  private _checkAvailability(entry: DownloadEntry): boolean {
    return !this._processedEntries.has(entry.fileName);
  }
}
