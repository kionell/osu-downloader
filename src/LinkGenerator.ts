import { DownloadEntry } from './DownloadEntry';
import { DownloadTypes } from './Enums/DownloadTypes';

export class LinkGenerator {
  /**
   * Domains of the currently working beatmap servers.
   */
  static BANCHO_DOMAIN = 'osu.ppy.sh';
  static BEATCONNECT_DOMAIN = 'beatconnect.io';
  static CHIMU_DOMAIN = 'api.chimu.moe';

  /**
   * The type of the link (beatmap or beatmapset).
   */
  private _type: DownloadTypes;

  /**
   * The file ID.
   */
  private _id: string | number;

  constructor(entry: DownloadEntry) {
    this._type = entry.type;
    this._id = entry.id;
  }

  generate(): string[] {
    if (this._type === DownloadTypes.Set) {
      return [
        `https://${LinkGenerator.CHIMU_DOMAIN}/v1/download/${this._id}?n=1`,
        `https://${LinkGenerator.BEATCONNECT_DOMAIN}/b/${this._id}`,
      ];
    }

    return [
      `https://${LinkGenerator.BANCHO_DOMAIN}/osu/${this._id}`,
    ];
  }
}
