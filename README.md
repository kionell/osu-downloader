# osu-downloader
[![CodeFactor](https://img.shields.io/codefactor/grade/github/kionell/osu-parsers)](https://www.codefactor.io/repository/github/kionell/osu-downloader)
[![License](https://img.shields.io/github/license/kionell/osu-parsers)](https://github.com/kionell/osu-downloader/blob/master/LICENSE)
[![Package](https://img.shields.io/npm/v/osu-parsers)](https://www.npmjs.com/package/osu-downloader)


This is a simple tool for downloading osu! beatmaps and beatmapsets.
This package provides the following features:

- Built-in rate limiter to prevent too many requests to the servers.
- Ability to choose the number of files that can be downloaded per second.
- Ability to choose between .osu and .osz files.
- Multiple downloading sources for beatmapsets.
- Protection against multiple downloads of the same file.
- File validation before every downloading.

## Installation

Add a new dependency to your project via npm:

```bash
npm install osu-downloader
```

### Requirements

Since this project uses ES Modules, it is recommended to use Node.js 12.22.0 or newer.

## Basic example of single file downloading

```js
import { BeatmapDownloader } from 'osu-downloader'

const downloader = new BeatmapDownloader('./cache', 2);

downloader.addSingleEntry('91');
downloader.downloadSingle();
```

## Basic example of multiple file downloading

```js
import { BeatmapDownloader } from 'osu-downloader'

const downloader = new BeatmapDownloader('./cache', 2);

const entries = ['91', '335628', 1228616];

downloader.addMultipleEntries(entries);

downloader.downloadSingle(); // First file will be downloaded.
downloader.downloadSingle(); // Second file will be downloaded.
downloader.downloadAll();    // Rest of the files will be downloaded.
```

## Advanced example of file downloading using download entries

```js
import { BeatmapDownloader, DownloadEntry, DownloadTypes } from 'osu-downloader'

const downloader = new BeatmapDownloader('./cache', 2);

/**
 * Adds a new entry for .osu file to the download query.
 */
downloader.addSingleEntry(new DownloadEntry('91'));

/**
 * Adds a new entry for .osz file to the download query.
 */
downloader.addSingleEntry(new DownloadEntry('91', DownloadTypes.Set));

/**
 * Adds multiple entries to the download query.
 * You can combine different styles of writing and file types.
 */
downloader.addMultipleEntries([
  new DownloadEntry('91', DownloadTypes.Set),                  // osu! beatmapset with ID 91.
  new DownloadEntry('1229091', DownloadTypes.Set),             // osu! beatmapset with ID 1229091.
  new DownloadEntry('91', DownloadTypes.Beatmap),              // osu! beatmap with ID 91.

  /* Already downloaded maps will return status code 1. */
  new DownloadEntry(91),                                       // osu! beatmap with ID 91.
  '91',                                                        // osu! beatmap with ID 91.
  91,                                                          // osu! beatmap with ID 91.

  /* Non-existent osu! beatmaps will return status code -1 */
  new DownloadEntry(1337),                                     // osu! beatmap with ID 1337.
]);

/**
 * All number or string IDs will always refer to the osu! beatmaps.
 */
downloader.addSingleEntry('965234');
downloader.addSingleEntry(1949106);

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

- -1 - File failed to download.
-  0 - File failed to write.
-  1 - File already exists.
-  2 - File downloaded successfuly.

## File types

- 0 - osu! beatmap (.osu file format).
- 1 - osu! beatmapsets (.osz file format).

## Documentation

Auto-generated documentation is available [here](https://kionell.github.io/osu-downloader/).

## Contributing

This project is being developed personally by me on pure enthusiasm. If you want to help with development or fix a problem, then feel free to create a new pull request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](https://choosealicense.com/licenses/mit/) for details.
