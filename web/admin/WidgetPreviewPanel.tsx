// The widget preview of the Widgets page, a card under the screen preview: only the widget being edited, with its
// unsaved changes, as the TV draws it at the chosen place (widgetPreview.ts). Clearly a preview: placing a widget on a
// screen is done in Diseño.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DisplayConfig, StoredConfig, WidgetSize } from '../shared/types';
import { Segmented } from './components/ui';
import { t } from './i18n';
import { draftDisplayConfig } from './livePreview';
import { Preview } from './Preview';
import { setPreviewSpot, setPreviewWidget, useWidgetPreview, widgetPreviewDraft, widgetPreviewSpot, type WidgetPreviewPlace } from './widgetPreview';

type PreviewProps = Parameters<typeof Preview>[0];

/** Price views by name, for the note when one does not fit (the same names as the View field). */
const VIEW_NAME: Record<string, string> = { chart: 'Gráfica 24 h', cheap: 'Franjas baratas', next: 'Próximas 24 h' };

/** `frame`: where the preview frame loads the screen, with widgetOnly=1 (null while the screen is not saved). */
export function WidgetPreviewPanel({ draft, screenId, go, setScreenId, variant, reloadKey, portrait, frame, onLeave }: {
  draft: StoredConfig;
  screenId: string;
  go: (route: string) => void;
  setScreenId: (id: string) => void;
  /** called before the link to Diseño navigates (the phone sheet closes) */
  onLeave?: () => void;
  frame: Pick<PreviewProps, 'saved' | 'url' | 'openUrl'>;
} & Pick<PreviewProps, 'variant' | 'reloadKey' | 'portrait'>) {
  const pick = useWidgetPreview();
  const widgets = draft.widgets ?? [];
  const w = widgets.find((x) => x.id === pick.id) ?? widgets[0];
  const spot = w ? pick.spot ?? widgetPreviewSpot(draft, screenId, w) : null;
  // the draft as the screen would show this widget there, a short pause after each change (as the screen preview);
  // built again after a test too: on Marco Cloud the tested copy of an unsaved image goes with it (livePreview.ts)
  const [live, setLive] = useState<DisplayConfig | null>(null);
  const key = w && spot ? `${w.id}|${spot.place}|${spot.size}|${spot.corner}` : '';
  const source = useMemo(() => (w && spot ? widgetPreviewDraft(draft, screenId, w.id, spot) : null), [draft, screenId, key, pick.tested]);
  useEffect(() => {
    const id = window.setTimeout(() => setLive(source ? draftDisplayConfig(source, screenId) : null), 150);
    return () => clearTimeout(id);
  }, [source, screenId]);
  // what a price card draws there: a view that needs more room falls back to the price now, as on the TV
  const [info, setInfo] = useState<{ mode: string | null; cramped: boolean }>({ mode: null, cramped: false });
  useEffect(() => setInfo({ mode: null, cramped: false }), [key]);
  if (!w || !spot) return null;
  const setPlace = (place: WidgetPreviewPlace) => setPreviewSpot({ ...spot, place, size: place === 'full' ? 'l' : spot.size });
  const setSize = (size: WidgetSize) => setPreviewSpot({ ...spot, size });
  const view = w.type === 'prices' ? w.options.prices?.view ?? 'auto' : 'auto';
  const tooSmall = !!VIEW_NAME[view] && info.mode === 'now';
  return (
    <Preview
      {...frame}
      variant={variant}
      reloadKey={reloadKey}
      portrait={portrait}
      live={live}
      focus={w.id}
      onFocus={setInfo}
      reload={pick.tested}
      title={t('Vista previa del widget')}
      tag={t('Solo vista previa')}
      choices={widgets.length > 1 ? widgets.map((x) => ({ value: x.id, label: x.name.trim() || t('Widget sin nombre') })) : undefined}
      chosen={w.id}
      onChoose={setPreviewWidget}
      hint={t('Solo el widget, con los cambios sin guardar. «Probar» lo carga de nuevo.')}
      extra={
        <div class="wpv-opts" role="group" aria-label={t('Dónde se ve en la vista previa')}>
          <Segmented
            size="sm"
            value={spot.place}
            options={[
              { value: 'corner', label: t('Esquina') },
              { value: 'side', label: t('Lateral') },
              { value: 'full', label: t('Pantalla completa') },
            ]}
            onChange={setPlace}
          />
          {spot.place !== 'full' && (
            <Segmented
              size="sm"
              value={spot.size}
              options={[
                { value: 's', label: 'S', title: t('Pequeño') },
                { value: 'm', label: 'M', title: t('Mediano') },
                { value: 'l', label: 'L', title: t('Grande') },
              ]}
              onChange={setSize}
            />
          )}
        </div>
      }
      note={
        <div class="wpv-note">
          {tooSmall && (
            <p class="small wpv-warn">{t('«{view}» no cabe en este tamaño: la pantalla muestra el precio de ahora. Prueba un tamaño mayor o la columna lateral.', { view: t(VIEW_NAME[view]) })}</p>
          )}
          {info.cramped && <p class="small wpv-warn">{t('No cabe en este sitio: la pantalla no lo mostraría. Prueba otro tamaño o sitio.')}</p>}
          <p class="small">
            {t('Para ponerlo en una pantalla, ve a Diseño → Widgets en esta pantalla; allí eliges dónde va y su tamaño.')}{' '}
            <button
              type="button"
              class="link-btn"
              onClick={() => {
                setScreenId(screenId);
                onLeave?.();
                go('layout/layout-widgets');
              }}
            >
              {t('Ir a Widgets en esta pantalla')}
            </button>
          </p>
        </div>
      }
    />
  );
}
