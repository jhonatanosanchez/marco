// Pure helpers of the photo rotation (widgets/photos.ts): when a photo gets the blurred fill, and the Immich caption.
import type { BackgroundConfig, Photo } from '../shared/types';

/** Whether a photo gets the blurred fill: the setting (auto = Immich photos only), cover on, and an orientation that
 *  differs from the panel's (portrait photo on a landscape screen, or the other way round). */
export function wantsBlurFill(b: Pick<BackgroundConfig, 'cover' | 'portraitFit'>, p: Pick<Photo, 'source'>, iw: number, ih: number, aw: number, ah: number): boolean {
  if (!b.cover || !iw || !ih || !aw || !ah) return false;
  const fit = b.portraitFit ?? 'auto';
  if (fit === 'crop' || (fit === 'auto' && p.source !== 'immich')) return false;
  const ia = iw / ih, aa = aw / ah;
  return ia < 1 !== aa < 1 && Math.max(ia / aa, aa / ia) > 1.25;
}

/** Caption of an Immich photo: "Valencia, Spain · 12 August 2019" in the screen's language. */
export function immichCaption(p: Pick<Photo, 'takenAt' | 'place'>, lang: string): string {
  let date = '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.takenAt || '');
  if (m) {
    try {
      date = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
    } catch {
      date = p.takenAt!;
    }
  }
  return [p.place, date].filter(Boolean).join(' · ');
}
