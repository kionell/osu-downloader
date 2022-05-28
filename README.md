# osu-downloader
[![CodeFactor](https://img.shields.io/codefactor/grade/github/kionell/osu-downloader)](https://www.codefactor.io/repository/github/kionell/osu-downloader)
[![License](https://img.shields.io/github/license/kionell/osu-downloader)](https://github.com/kionell/osu-downloader/blob/master/LICENSE)
[![Package](https://img.shields.io/npm/v/osu-downloader)](https://www.npmjs.com/package/osu-downloader)


This is a simple tool for downloading osu! beatmaps, beatmapsets and replays.
This package provides the following features:

- Built-in rate limiter to prevent too many requests to the servers.
- Ability to choose the number of files that can be downloaded per second.
- Ability to choose between .osu, .osz and .osr files.
- Multiple downloading sources for beatmapsets.
- Protection against multiple downloads of the same file.
- File validation before every downloading.

## Installation

Add a new dependency to your project via npm:

```bash
npm install osu-downloader
```

### Requirements

Since this project uses ES Modules and highly relies on file system operations, it is recommended to use Node.js 12.22.0 or newer.

## Basic example of single file downloading

```js
import { Downloader, DownloadEntry } from 'osu-downloader'

const downloader = new Downloader({
  rootPath: './cache', 
  
  /**
   * Unlimited downloading.
   * This is not safe as it may result to 429 error.
   * You can also use fractional values (like 0.1, 0.2)
   * if one second is too fast for your application. 
   */
  filesPerSecond: 0,
});

downloader.addSingleEntry(91);

await downloader.downloadSingle();
```

## Basic example of multiple file downloading

```js
import { Downloader } from 'osu-downloader'

const downloader = new Downloader({
  rootPath: './cache', 
  filesPerSecond: 2, // Limit to 2 files per second.
  synchronous: true, // Download each file one by one.
});

const entries = [
  new DownloadEntry({ id: '91' }),
  new DownloadEntry({ id: 1228616 }),
  '335628',
  1626530,
];

downloader.addMultipleEntries(entries);

await downloader.downloadSingle(); // First file will be downloaded.
await downloader.downloadSingle(); // Second file will be downloaded.
await downloader.downloadAll();    // Rest of the files will be downloaded.
```

## Advanced example of file downloading

```js
import { Downloader, DownloadEntry, DownloadTypes } from 'osu-downloader'

const downloader = new Downloader({
  rootPath: './cache', 
  filesPerSecond: 2,
});

/**
 * Adds a new entry for .osu file to the download query.
 */
downloader.addSingleEntry(new DownloadEntry({
  id: '91',
  save: false, // Don't save file on a disk.
}));

/**
 * Adds a new entry for .osz file to the download query.
 */
downloader.addSingleEntry(new DownloadEntry({
  id: 3,
  customName: 'myfavouritebeatmapset.osz',
  type: DownloadType.Set,
  redownload: true,
}));

/**
 * Adds multiple entries to the download query.
 * You can combine different styles of writing and file types.
 */
downloader.addMultipleEntries([
  /* Beatmapset with ID 773801. */
  new DownloadEntry({
    id: 773801;
    type: DownloadType.Set;
  }),

  /* Non-existent osu! beatmaps will return status code -3 (Failed to download) */
  new DownloadEntry({
    id: 1337;
  }),

  /* Already downloaded files will return status code 1 (Already exists). */
  new DownloadEntry({
    id: 773801;
    type: DownloadType.Set;
  }),

  /* This, however, should return status code 2 (Downloaded) as we have redownload flag. */
  new DownloadEntry({
    id: 773801;
    type: DownloadType.Set;
    redownload: true,
  }),

  /** 
   * Will download a replay file via custom URL. 
   * If there is no custom name then file will be named as MD5 hash of URL. 
   */
  new DownloadEntry({
    url: 'https://your-replay-url',
    type: DownloadType.Replay,
  }),
]);

/**
 * Print downloader progress to the console every 100ms.
 */
setInterval(() => {
  console.log(downloader.progress);
}, 100);

/**
 * Save results of downloading.
 */
const result0 = await downloader.downloadSingle(); // First file will be downloaded.
const result1 = await downloader.downloadSingle(); // Second file will be downloaded.
const results = await downloader.downloadAll();    // Rest of the files will be downloaded.
```

## Status Codes

- -3 - File failed to download.
- -2 - Wrong file format.
- -1 - File failed to write.
-  0 - Empty file.
-  1 - File already exists,
-  2 - File downloaded successfuly.
-  3 - Written on a disk.

## File types

- 0 - osu! beatmap (.osu file format).
- 1 - osu! beatmapset (.osz file format).
- 2 - osu! replay (.osr file format).

## Documentation

Auto-generated documentation is available [here](https://kionell.github.io/osu-downloader/).

## Contributing

This project is being developed personally by me on pure enthusiasm. If you want to help with development or fix a problem, then feel free to create a new pull request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](https://choosealicense.com/licenses/mit/) for details.
