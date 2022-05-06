import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as limiter from 'limiter';
import { Readable } from 'stream';

import { DownloadingQueue } from './DownloadingQueue';
import { DownloadResult } from './DownloadResult';
import { DownloadEntry } from './DownloadEntry';
import { DownloadStatus } from './Enums/DownloadStatus';
import { DownloadType } from './Enums/DownloadType';
import { LinkGenerator } from './Utils/LinkGenerator';

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
  protected _limiter: limiter.RateLimiter | null = null;

  /**
   * How many beatmaps can be downloaded in one second.
   * (0 - synchronous downloading).
   */
  protected _beatmapsPerSecond = 0;

  /**
   * The number of the current downloading file.
   */
  currentFile = 0;

  /**
   * Total amount of files at the start of downloading.
   */
  totalFiles = 0;

  /**
   * @param beatmapsPerSecond How many beatmaps per second will be downloaded. (0 - synchronous downloading).
   * @constructor
   */
  constructor(beatmapsPerSecond?: number);

  /**
   * @param rootPath A path for saving beatmaps.
   * @param beatmapsPerSecond How many beatmaps per second will be downloaded. (0 - synchronous downloading).
   * @constructor
   */
  constructor(rootPath?: string | number, beatmapsPerSecond?: number) {
    if (typeof rootPath === 'string') {
      this._rootPath = path.normalize(rootPath);

      if (!fs.existsSync(this._rootPath)) {
        fs.mkdirSync(this._rootPath, { recursive: true });
      }
    }

    if (typeof rootPath === 'number') {
      beatmapsPerSecond = rootPath;
    }

    this._beatmapsPerSecond = beatmapsPerSecond || 0;

    if (this._beatmapsPerSecond !== 0) {
      this._limiter = new limiter.RateLimiter({
        tokensPerInterval: this._beatmapsPerSecond,
        interval: 'second',
      });
    }
  }

  get progress(): number {
    if (this.totalFiles === 0) return 0;

    return this.currentFile / this.totalFiles;
  }

  /**
   * Adds a single entry to the beatmap downloader's queue.
   * @param input ID or download entry.
   * @returns The number of entries in the queue.
   */
  addSingleEntry(input: string | number | DownloadEntry): number {
    if (this._queue.isEmpty) this.reset();

    const entry = input instanceof DownloadEntry
      ? input : new DownloadEntry({ id: input });

    if (entry.save && this._checkFileValidity(entry)) {
      this._validFiles.add(entry.fileName);
    }

    this._queue.enqueue(entry);

    this.totalFiles = Math.max(this.totalFiles, this._queue.count);

    return this._queue.count;
  }

  /**
   * Adds multiple entries to the beatmap downloader's queue.
   * @param inputs The entries to be added.
   * @returns The number of entries in the queue.
   */
  addMultipleEntries(inputs: (string | number | DownloadEntry)[]): number {
    if (this._queue.isEmpty) this.reset();

    if (!Array.isArray(inputs)) {
      return this._queue.count;
    }

    inputs?.forEach((input) => this.addSingleEntry(input));

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
    const isSynchronous = this._beatmapsPerSecond === 0;

    while (!this._queue.isEmpty) {
      results.push(isSynchronous ? await this.downloadSingle() : this.downloadSingle());
    }

    return Promise.all(results);
  }

  /**
   * Downloads a single file from the queue. 
   * By default it saves all files on a disk and resulting buffer will be null.
   * If file is already exists or failed to write the buffer will also be null.
   * @returns Download results.
   */
  async downloadSingle(): Promise<DownloadResult> {
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
    if (this._rootPath && entry.save && this._checkFileValidity(entry)) {
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
   * Cancels the current beatmap downloader work.
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

    if (this._limiter) {
      await this._limiter.removeTokens(1);
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
  private _checkFileValidity(entry: DownloadEntry): boolean {
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

    if (!filePath || !fs.existsSync(filePath)) return false;

    const buffer = Buffer.alloc(17);
    const fd = fs.openSync(filePath, 'r');

    fs.readSync(fd, buffer, { length: 17 });

    return this._validateBuffer(buffer, entry.type);
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

    const start = buffer.slice(0, 17).toString();

    return start === 'osu file format v';
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
