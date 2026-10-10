import { atLimit, limit, type LimitName } from '../caps';
import { t } from '../i18n';
import { Callout } from './ui';

/** Shown next to an "add" control: a warning when the list is over its limit, a short note when it is full. */
export function LimitNote({ name, count }: { name: LimitName; count: number }) {
  const max = limit(name);
  if (max == null || !atLimit(name, count)) return null;
  if (count > max) return <Callout kind="error">{t('Hay {n} y el máximo es {max}. Quita algunos para poder guardar.', { n: count, max })}</Callout>;
  return <p class="muted small limit-note">{t('Has llegado al máximo ({max}).', { max })}</p>;
}
