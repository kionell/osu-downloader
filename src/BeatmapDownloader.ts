import * as limiter from 'limiter';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';

import { LinkGenerator } from './LinkGenerator';
import { DownloadingQueue } from './DownloadingQueue';
import { DownloadResult } from './DownloadResult';
import { DownloadEntry } from './DownloadEntry';
import { DownloadStatuses } from './Enums/DownloadStatuses';

/**
 * A beatmap downloader.
 */
export class BeatmapDownloader {
  /**
   * The queue of downloading maps.
   */
  protected _queue: DownloadingQueue = new DownloadingQueue();

  /**
   * List of valid files.
   */
  protected _validFiles: Set<string> = new Set();

  /**
   * List of files that are currently being processed.
   */
  protected _processedFiles: Set<string> = new Set();

  /**
   * A root path for saving files.
   */
  protected _rootPath: string;

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
   * @param rootPath A path for saving beatmaps.
   * @param beatmapsPerSecond How many beatmaps per second will be downloaded. 
   * (0 - synchronous downloading).
   * @constructor
   */
  constructor(rootPath: string, beatmapsPerSecond?: number) {
    this._rootPath = path.normalize(rootPath);

    if (!fs.existsSync(this._rootPath)) {
      fs.mkdirSync(this._rootPath, { recursive: true });
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
   * @param input The entry to be added.
   * @returns The number of entries in the queue.
   */
  addSingleEntry(input: string | number | DownloadEntry): number {
    if (this._queue.isEmpty) {
      this.reset();
    }

    const entry = input instanceof DownloadEntry
      ? input : new DownloadEntry(input);

    if (this._checkFileValidity(entry)) {
      this._validFiles.add(entry.fileName);
    }

    this._queue.enqueue(entry);

    return this._queue.count;
  }

  /**
   * Adds multiple entries to the beatmap downloader's queue.
   * @param inputs The entries to be added.
   * @returns The number of entries in the queue.
   */
  addMultipleEntries(inputs: (string | number | DownloadEntry)[]): number {
    if (this._queue.isEmpty) {
      this.reset();
    }

    inputs?.forEach((input) => {
      const entry = input instanceof DownloadEntry
        ? input : new DownloadEntry(input);

      this.addSingleEntry(entry);
    });

    return this._queue.count;
  }

  /**
   * Downloads every map from the queue.
   * @returns The download results.
   */
  async downloadAll(): Promise<DownloadResult[]> {
    const results = [];
    const isSynchronous = this._beatmapsPerSecond === 0;

    while (!this._queue.isEmpty) {
      results.push(isSynchronous ? await this.downloadSingle() : this.downloadSingle());
    }

    return Promise.all(results);
  }

  async downloadSingle(): Promise<DownloadResult> {
    this.totalFiles = Math.max(this.totalFiles, this._queue.count);

    const entry = this._queue.dequeue();

    /**
     * Check if file is:
     *  - being processed through another entry
     *  - already downloaded.
     */
    if (this._checkAvailability(entry) && !this._checkFileValidity(entry)) {
      return this._requestFile(entry);
    }

    this.currentFile++;

    return new DownloadResult(entry, DownloadStatuses.FileExists, this._rootPath);
  }
  /**
   * Cancels the current beatmap downloader work.
   */
  reset(): void {
    this._queue.clear();
    this._validFiles.clear();
    this._processedFiles.clear();
    this.currentFile = 0;
    this.totalFiles = 0;
  }

  /**
   * Requests a file from the download entry using the rate limiter.
   * @param entry A download entry.
   * @returns The downloading result.
   */
  private async _requestFile(entry: DownloadEntry): Promise<DownloadResult> {
    /**
     * Block current file to prevent downloading from multiple entries.
     */
    if (this._checkAvailability(entry)) {
      this._processedFiles.add(entry.fileName);
    }

    if (this._limiter) {
      await this._limiter.removeTokens(1);
    }

    const links = this._getRequestLinks(entry);

    for (const link of links) {
      try {
        const response = await axios({
          url: link,
          method: 'GET',
          responseType: 'stream',
          headers: {
            'Accept': 'application/octet-stream',
            'Content-Type': 'application/octet-stream',
          },
        });

        const message = response.data as IncomingMessage;

        if (response.status !== 200 || !message.readableLength) continue;

        return this._tryToSaveFile(message, entry);
      }
      catch (err) {
        continue;
      }
    }

    this.currentFile++;

    return new DownloadResult(entry, DownloadStatuses.FailedToDownload, this._rootPath);
  }

  private async _tryToSaveFile(readable: Readable, entry: DownloadEntry): Promise<DownloadResult> {
    const filePath = this._getFilePath(entry);
    const writable = fs.createWriteStream(filePath);

    return new Promise((res) => {
      const onError = () => {
        this.currentFile++;
        res(new DownloadResult(entry, DownloadStatuses.FailedToWrite, this._rootPath));
      };

      const onSuccess = () => {
        this.currentFile++;
        res(new DownloadResult(entry, DownloadStatuses.Downloaded, this._rootPath));
      };

      writable.on('error', onError);

      writable.on('finish', () => {
        writable.bytesWritten > 0 ? onSuccess() : onError();
        writable.close();
      });

      readable.pipe(writable);
    });
  }

  /**
   * Generates request link by corresponding download entry.
   * @param entry A download entry.
   * @returns The generated request link.
   */
  private _getRequestLinks(entry: DownloadEntry): string[] {
    return new LinkGenerator(entry).generate();
  }

  /**
   * Generates the path to the downloaded file.
   * @param entry A download entry.
   * @returns The generated request link.
   */
  private _getFilePath(entry: DownloadEntry): string {
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

    const filePath = this._getFilePath(entry);

    /**
     * If file exists or it isn't empty.
     */
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      return true;
    }

    return false;
  }

  /**
   * Checks if file is available to download from this entry.
   * @param entry The download entry.
   * @returns Whether the file is available to download
   */
  private _checkAvailability(entry: DownloadEntry): boolean {
    return !this._processedFiles.has(entry.fileName);
  }
}
