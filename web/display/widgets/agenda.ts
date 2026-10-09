// Agenda list view (today / tomorrow / next days) with big emojis.
import { addDays, diffDays, relativeDayLabel, weekdayName, keyToUTC, monthName } from '../../shared/i18n';
import { chipColors } from '../color';
import { ctx } from '../ctx';
import { esc, reconcile, type Spec } from '../dom';
import { type NEvent, sortForDay, timeLabel } from '../eventModel';
import type { Tick } from '../time';

export class Agenda {
  constructor(private root: HTMLElement, private opts: { days: number; compact?: boolean; maxPerDay?: number }) {
    root.classList.add('agenda');
    if (opts.compact) root.classList.add('compact');
  }

  render(events: NEvent[], tick: Tick): void {
    const { cfg, lang, tz, t } = ctx;
    const c = cfg.calendar;
    const today = tick.dayKey;
    const nowMs = tick.now.getTime();
    const specs: Spec[] = [];
    let shown = 0;
    for (let i = 0; i < this.opts.days; i++) {
      const key = addDays(today, i);
      const items: { e: NEvent; sub: string; badge?: string }[] = [];
      for (const e of events) {
        if (e.spanFirst > key || e.spanLast < key) continue;
        if (e.timed && i === 0 && e.endMs <= nowMs && this.opts.compact) continue;
        let sub = '';
        let badge: string | undefined;
        if (e.checkoutMarker) {
          badge = t('checkOut');
        } else if (e.airbnb) {
          if (key === e.spanFirst) badge = t('checkIn');
          else if (key === e.spanLast) badge = `${t('checkOut')} 🚪`;
          else if (i !== 0) continue;
          else sub = t('dayXofY', { x: diffDays(e.spanFirst, key) + 1, y: e.days + 1 });
        } else if (e.bar && e.days > 1) {
          if (key !== e.spanFirst && i !== 0) continue;
          sub = c.showDayXofY ? t('dayXofY', { x: diffDays(e.spanFirst, key) + 1, y: e.days }) : t('allDay');
        } else if (e.allDay) {
          sub = t('allDay');
        } else {
          sub = timeLabel(e, tz, cfg.datetime.format24, cfg.datetime.showAmPm, true);
        }
        if (c.showLocation && e.ev.location) sub += ` · ${e.ev.location}`;
        items.push({ e, sub, badge });
      }
      if (!items.length && i > 1) continue;
      items.sort((a, b) => sortForDay(a.e, b.e));
      const max = this.opts.maxPerDay ?? 99;
      const rows = items.slice(0, max).map(({ e, sub, badge }) => {
        const col = chipColors(e.color);
        const past = e.timed && e.endMs <= nowMs;
        const now = e.timed && e.startMs <= nowMs && e.endMs > nowMs;
        return `<div class="ag-ev${past ? ' past' : ''}${now ? ' ongoing' : ''}" style="--c:${col.base};--tint:${col.tint};--shade:${col.shade}">
          <span class="ag-em">${e.emoji ? esc(e.emoji) : '<i class="ag-dot"></i>'}</span>
          <div class="ag-main"><div class="ag-tt">${esc(e.title)}</div>${sub || badge ? `<div class="ag-sub">${badge ? `<b class="badge">${esc(badge)}</b>` : ''}${esc(sub)}</div>` : ''}</div>
        </div>`;
      });
      if (items.length > max) rows.push(`<div class="ag-more">${esc(t('more', { n: items.length - max }))}</div>`);
      if (!rows.length) rows.push(`<div class="ag-empty">${esc(t('noEvents'))}</div>`);
      const d = keyToUTC(key);
      const rel = relativeDayLabel(lang, key, today, false);
      const dateStr = `${weekdayName(lang, key, 'long')} ${d.getUTCDate()} ${monthName(lang, d.getUTCMonth() + 1, 'short')}`;
      const label = i < 2 ? `<b>${esc(rel)}</b><span>${esc(dateStr)}</span>` : `<b>${esc(dateStr)}</b>`;
      specs.push({
        key: `d${key}`,
        className: `ag-day${i === 0 ? ' today' : ''}`,
        html: `<div class="ag-date">${label}</div><div class="ag-list">${rows.join('')}</div>`,
      });
      shown++;
    }
    if (!shown) specs.push({ key: 'empty', className: 'ag-empty big', html: esc(t('noUpcoming')) });
    reconcile(this.root, specs, { flip: true });
  }
}
