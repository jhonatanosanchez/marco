// "Today's highlights" pills: next event countdown, ongoing event, birthdays, check-ins / check-outs.
import { addDays, formatCountdown, formatTime } from '../../shared/i18n';
import { chipColors } from '../color';
import { ctx } from '../ctx';
import { esc, reconcile, type Spec } from '../dom';
import type { NEvent } from '../eventModel';
import type { Tick } from '../time';

export class Highlights {
  constructor(private root: HTMLElement) {
    root.classList.add('highlights');
  }

  render(events: NEvent[], tick: Tick): void {
    const { cfg, lang, tz, t } = ctx;
    const nowMs = tick.now.getTime();
    const today = tick.dayKey;
    const f24 = cfg.datetime.format24, ampm = cfg.datetime.showAmPm;
    const specs: Spec[] = [];
    const pill = (key: string, e: NEvent, lead: string, text: string, extra = '') => {
      const col = chipColors(e.color);
      specs.push({
        key,
        className: `hl-pill${extra}`,
        style: `--c:${col.base};--tint:${col.tint};--deep:${col.shade}`,
        html: `<span class="hl-lead">${esc(lead)}</span><span class="hl-em">${esc(e.emoji || '•')}</span><span class="hl-tt">${esc(text)}</span>`,
      });
    };

    // Ongoing + next timed events (within 24 h)
    const timed = events.filter((e) => !e.allDay && e.endMs > nowMs && e.startMs < nowMs + 24 * 3600e3).sort((a, b) => a.startMs - b.startMs);
    const ongoing = timed.filter((e) => e.startMs <= nowMs && !e.bar);
    const next = timed.find((e) => e.startMs > nowMs);
    for (const e of ongoing.slice(0, 1)) {
      pill(`on${e.id}`, e, t('happeningNow'), `${e.title} · ${t('untilTime', { t: formatTime(new Date(e.endMs), tz, f24, ampm) })}`, ' live');
    }
    if (next) {
      pill(`nx${next.id}`, next, formatCountdown(lang, next.startMs - nowMs), `${next.title} · ${formatTime(new Date(next.startMs), tz, f24, ampm)}`);
    }
    // Today's special all-day things: birthdays, check-in/out
    const seenStay = new Set<string>();
    for (const e of events) {
      if (specs.length >= 4) break;
      if (e.airbnb) {
        const tomorrow = addDays(today, 1);
        // Some feeds (e.g. property-management tools) add a separate one-day "🚪 Guest" event on the checkout day:
        // that is a departure, not an arrival.
        const marker = e.checkoutMarker;
        const guest = e.title.split(' · ')[0].trim().toLowerCase();
        const outPill = (when: string, label: string) => {
          const key = `out|${when}|${guest}`;
          if (seenStay.has(key)) return;
          seenStay.add(key);
          pill(`co${e.id}${when}`, { ...e, emoji: '🚪' }, `${t('checkOut')} · ${label}`, e.title);
        };
        if (marker) {
          if (e.startKey === today) outPill(today, t('today'));
          else if (e.startKey === tomorrow) outPill(tomorrow, t('tomorrow'));
        } else if (e.spanFirst === today) pill(`ci${e.id}`, e, `${t('checkIn')} · ${t('today')}`, e.title);
        else if (e.spanLast === today) outPill(today, t('today'));
        else if (e.spanFirst === tomorrow) pill(`ct${e.id}`, e, `${t('checkIn')} · ${t('tomorrow')}`, e.title);
        else if (e.spanLast === tomorrow) outPill(tomorrow, t('tomorrow'));
        continue;
      }
      if (isBirthday(e) && e.startKey <= today && e.lastKey >= today) pill(`bd${e.id}`, e, t('today'), e.title);
    }
    // Tomorrow's birthdays, after today's things so they never push those out.
    const tomorrow = addDays(today, 1);
    for (const e of events) {
      if (specs.length >= 4) break;
      if (isBirthday(e) && e.startKey === tomorrow) pill(`bt${e.id}`, e, t('tomorrow'), e.title);
    }
    this.root.style.display = specs.length ? '' : 'none';
    reconcile(this.root, specs.slice(0, 4), { flip: true });
  }
}

const isBirthday = (e: NEvent) => e.allDay && (e.ev.kind === 'birthdays' || e.emoji === '🎂');
