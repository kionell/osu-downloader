import { DownloadType } from '../Enums/DownloadType';

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
  private _type: DownloadType;

  /**
   * The file ID.
   */
  private _id: string | number;

  constructor(type: DownloadType, id: string | number) {
    this._type = type;
    this._id = id;
  }

  generate(): string[] {
    switch (this._type) {
      case DownloadType.Beatmap:
        return [
          `https://${LinkGenerator.BANCHO_DOMAIN}/osu/${this._id}`,
        ];

      case DownloadType.Set:
        return [
          `https://${LinkGenerator.CHIMU_DOMAIN}/v1/download/${this._id}?n=1`,
          `https://${LinkGenerator.BEATCONNECT_DOMAIN}/b/${this._id}`,
        ];

      default:
        return [];
    }
  }
}
