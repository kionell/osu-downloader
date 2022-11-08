import axios from 'axios';
import {
  createWriteStream,
  promises as fs,
} from 'fs';

import path from 'path';
import Bottleneck from 'bottleneck';
import SparkMD5 from 'spark-md5';
import { Readable } from 'stream';

import { DownloadingQueue } from './DownloadingQueue';
import { DownloadResult } from './DownloadResult';
import { DownloadEntry } from './DownloadEntry';
import { DownloadStatus } from './Enums/DownloadStatus';
import { DownloadType } from './Enums/DownloadType';
import { LinkGenerator } from './Utils/LinkGenerator';
import { IDownloaderOptions } from './Interfaces/IDownloaderOptions';
import { IDownloadResultOptions } from './Interfaces/IDownloadResultOptions';
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
   * A rate limiter to prevent big amount of requests.
   */
  protected _limiter: Bottleneck;

  protected _rootPath: string | null = './cache';
  protected _filesPerSecond = 0;
  protected _synchronous = true;

  protected _currentFile = 0;
  protected _totalFiles = 0;

  /**
   * @param options Downloader options.
   * @constructor
   */
  constructor(options?: IDownloaderOptions) {
    this._limiter = new Bottleneck();

    this.updateSettings({
      rootPath: './cache',
      filesPerSecond: 0,
      synchronous: true,
      ...options,
    });
  }

  /**
   * Current downloader progress.
   */
  get progress(): number {
    if (this.totalFiles === 0) return 0;

    return this.currentFile / this.totalFiles;
  }

  /**
   * The number of the current downloading file.
   */
  get currentFile(): number {
    return this._currentFile;
  }

  /**
   * Total amount of files at the start of downloading.
   */
  get totalFiles(): number {
    return this._totalFiles;
  }

  /**
   * A root path for saving files.
   */
  get rootPath(): string | null {
    return this._rootPath;
  }

  updateSettings(options?: IDownloaderOptions): void {
    const rootPath = options?.rootPath;
    const filesPerSecond = options?.filesPerSecond;
    const synchronous = options?.synchronous;

    if (typeof rootPath === 'string') {
      this._rootPath = path.normalize(rootPath);
    }
    else if (rootPath === null) {
      this._rootPath = null;
    }

    if (typeof filesPerSecond === 'number') {
      this._filesPerSecond = filesPerSecond;
    }

    if (typeof synchronous === 'boolean') {
      this._synchronous = synchronous;
    }

    if (typeof filesPerSecond === 'number' || typeof synchronous === 'boolean') {
      const files = Math.trunc(this._filesPerSecond);

      // This interval should be multiple of 250 ms.
      const multiplier = this._filesPerSecond ? this._filesPerSecond / files : 0;
      const interval = Math.trunc(250000 * multiplier) / 250;

      this._limiter.updateSettings({
        reservoir: this._filesPerSecond ? files : null,
        reservoirRefreshAmount: this._filesPerSecond ? files : null,
        reservoirRefreshInterval: this._filesPerSecond ? interval : null,
        maxConcurrent: this._synchronous ? 1 : null,
      });
    }
  }

  /**
   * Cancels current downloader work.
   */
  reset(): void {
    this._queue.clear();
    this._currentFile = 0;
    this._totalFiles = 0;
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

    this._totalFiles = Math.max(this._totalFiles, this._queue.count);

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
    const taskId = this._getSavePath(entry);

    /** 
     * Check if file is being processed through another entry.
     * If this entry has file path and currently is being processed
     * then we will return saved promise to its download result. 
     */
    if (taskId && Downloader._processed.has(taskId)) {
      return Downloader._processed.get(taskId) as Promise<DownloadResult>;
    }

    /**
     * Wrap this into async function to leave await 
     * for the next iteration of the event loop.
     */
    const task = async() => {
      if (await this._checkFileValidity(entry)) {
        return this._generateResult({
          status: DownloadStatus.FileExists,
          entry,
        });
      }

      return this._limiter.schedule(() => this._download(entry));
    };

    /**
     * Now we can call this task and add it to the processing map immediately.
     * This code below must be executed in the same iteration of the event loop!
     */
    const promise = task();

    if (taskId) Downloader._processed.set(taskId, promise);

    return promise;
  }

  private async _download(entry: DownloadEntry): Promise<DownloadResult> {
    const readable = await this._requestFile(entry);

    if (!readable?.readable) {
      return this._generateResult({
        status: DownloadStatus.FailedToDownload,
        entry,
      });
    }

    if (this._rootPath && entry.save) {
      const sparkMD5 = new SparkMD5.ArrayBuffer();
      const status = await this._tryToSaveFile(readable, entry, sparkMD5);
      const md5 = sparkMD5.end();

      sparkMD5.destroy();

      return this._generateResult({
        md5,
        entry,
        status,
      });
    }

    const buffer = await this._getBufferOrNull(readable);

    const isValid = this._validateFileFormat(buffer, entry.type);
    const status = isValid
      ? DownloadStatus.Downloaded
      : DownloadStatus.WrongFileFormat;

    return this._generateResult({ entry, status, buffer });
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

  /**
   * Tries to save file data on a disk and writes it hash
   * @param readable Readable stream.
   * @param entry Current download entry.
   * @param md5 MD5 incremental algorithm.
   * @returns Status of downloading.
   */
  private async _tryToSaveFile(
    readable: Readable,
    entry: DownloadEntry,
    md5: SparkMD5.ArrayBuffer,
  ): Promise<DownloadStatus> {
    const savePath = this._getSavePath(entry);
    const fileType = entry.type;

    if (!this._rootPath || !savePath) {
      return DownloadStatus.FailedToWrite;
    }

    // Create dir for cache files before saving.
    await fs.mkdir(this._rootPath, { recursive: true });

    return new Promise((res) => {
      const writable = createWriteStream(savePath);
      let firstChunk = Buffer.from([]);

      // Check first 24 bytes of the stream to validate file format.
      const firstChunkListener = (chunk: Buffer) => {
        firstChunk = Buffer.concat([firstChunk, chunk], firstChunk.length + chunk.length);

        if (firstChunk.length < 24) return;

        if (this._validateFileFormat(firstChunk, fileType)) {
          // Dettach current listener as we already collected first 24 bytes.
          readable.off('data', firstChunkListener);

          // Attach new event listener to write MD5 hash.
          readable.on('data', (chunk: Buffer) => {
            return md5.append(chunk);
          });

          return md5.append(firstChunk);
        }

        res(DownloadStatus.WrongFileFormat);

        fs.unlink(savePath);
        writable.close();
        readable.destroy();
      };

      readable.on('data', firstChunkListener);

      const onWriteFail = () => {
        res(DownloadStatus.FailedToWrite);
        fs.unlink(savePath);
      };

      writable.once('error', onWriteFail);

      writable.once('finish', () => {
        if (typeof entry.md5 === 'string' && entry.md5 !== md5.end()) {
          onWriteFail();
        }

        writable.bytesWritten > 0
          ? res(DownloadStatus.Written)
          : res(DownloadStatus.EmptyFile);

        if (writable.bytesWritten <= 0) {
          fs.unlink(savePath);
        }

        writable.close();
        readable.destroy();
      });

      readable.pipe(writable);
    });
  }

  /**
   * Tries to get buffer from a stream or file path.
   * @param readable Readable stream.
   * @returns Buffer or null.
   */
  private async _getBufferOrNull(readable: Readable): Promise<Buffer | null> {
    try {
      const chunks = [];

      for await (const chunk of readable) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    }
    catch {
      return null;
    }
  }

  /**
   * Generates a new download result.
   * @param options Download result options.
   * @returns Download result.
   */
  private async _generateResult(options: IDownloadResultOptions): Promise<DownloadResult> {
    // Increment current file counter.
    this._currentFile++;

    try {
      options.md5 ??= await this._getMD5Hash(options);
      options.rootPath = this._rootPath;

      return new DownloadResult(options);
    }
    catch {
      return new DownloadResult(options);
    }
  }

  /**
   * Tries to get MD5 of already downloaded file.
   * @param options Download result options.
   * @returns MD5 hash of downloaded file or null.
   */
  private async _getMD5Hash(options: IDownloadResultOptions): Promise<string | null> {
    if (options.md5) return options.md5;

    if (options.buffer) {
      return SparkMD5.ArrayBuffer.hash(options.buffer);
    }

    const sparkMD5 = new SparkMD5.ArrayBuffer();
    const filePath = this._getSavePath(options.entry);

    if (!filePath) return null;

    for await (const chunk of this._generateChunks(filePath)) {
      sparkMD5.append(chunk);
    }

    const md5 = sparkMD5.end();

    sparkMD5.destroy();

    return md5;
  }

  /**
   * Generates file chunks using shared buffer and async generator.
   * @param filePath File path.
   * @returns Shared buffer generator.
   */
  private async *_generateChunks(filePath: string): AsyncGenerator<Buffer> {
    const stats = await fs.stat(filePath);
    const file = await fs.open(filePath, 'r');

    const chunkSize = 1024 * 1024; // 1 MB
    const totalChunks = Math.ceil(stats.size / chunkSize);

    const sharedBuffer = Buffer.alloc(chunkSize);

    let bytesRead = 0;
    let end = chunkSize;

    for (let i = 0; i < totalChunks; i++) {
      await file.read(sharedBuffer, 0, sharedBuffer.length, null);

      bytesRead = (i + 1) * chunkSize;

      if (bytesRead > stats.size) {
        end = chunkSize - (bytesRead - stats.size);
      }

      yield sharedBuffer.slice(0, end);
    }

    await file.close();
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
   * Generates a path to the downloaded file.
   * @param entry A download entry.
   * @returns Generated file path.
   */
  private _getSavePath(entry: DownloadEntry): string | null {
    if (!this._rootPath || !entry.fileName) return null;

    return path.join(this._rootPath, entry.fileName);
  }

  /**
   * Checks if file exists or isn't empty.
   * @param entry The download entry.
   * @returns Whether the file is valid
   */
  private async _checkFileValidity(entry: DownloadEntry): Promise<boolean> {
    const savePath = this._getSavePath(entry);

    if (!savePath) return false;

    /**
     * Invalidate file if it doesn't require saving or requires redownloading.
     */
    if (!entry.save || entry.redownload) return false;

    try {
      const buffer = Buffer.alloc(21);

      const file = await fs.open(savePath, 'r');

      try {
        // Read 21 bytes with possible 3 bytes of BOM.
        await file.read(buffer, 0, 21);
        await file.close();
      }
      catch {
        // Nested try/catch block to close file descriptor.
        await file.close();
      }

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

    const string = chunk.toString().trimStart();

    return string.startsWith('osu file format v');
  }
}
