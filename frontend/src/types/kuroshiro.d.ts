/**
 * Type declarations for kuroshiro-browser
 */

declare module "kuroshiro-browser" {
  interface ConvertOptions {
    to: "hiragana" | "katakana" | "romaji";
    mode?: "normal" | "spaced" | "okurigana" | "furigana";
    romajiSystem?: "nippon" | "passport" | "hepburn";
  }

  export class Kuroshiro {
    static buildAndInitWithKuromoji(IS_PROD?: boolean): Promise<Kuroshiro>;
    convert(text: string, options: ConvertOptions): Promise<string>;
  }
}
