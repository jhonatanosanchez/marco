// The preview on the Widgets page: the widget being edited, with its unsaved changes, on the screen being edited and
// zoomed in on it (widgetPreview.ts). Clearly a preview: placing a widget on a screen is done in Diseño.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DisplayConfig, StoredConfig, WidgetSize } from '../shared/types';
import { Segmented } from './components/ui';
import { t } from './i18n';
import { draftDisplayConfig } from './livePreview';
import { Preview } from './Preview';
import { hasSideColumn, setPreviewSpot, setPreviewWidget, useWidgetPreview, widgetPreviewDraft, widgetPreviewSpot, type WidgetPreviewPlace } from './widgetPreview';

type PreviewProps = Parameters<typeof Preview>[0];

export function WidgetPreviewPanel({ draft, screenId, go, setScreenId, ...rest }: {
  draft: StoredConfig;
  screenId: string;
  go: (route: string) => void;
  setScreenId: (id: string) => void;
} & Pick<PreviewProps, 'variant' | 'reloadKey' | 'portrait' | 'onClose' | 'saved' | 'url' | 'openUrl' | 'screenName'>) {
  const pick = useWidgetPreview();
  const widgets = draft.widgets ?? [];
  const w = widgets.find((x) => x.id === pick.id) ?? widgets[0];
  const spot = w ? pick.spot ?? widgetPreviewSpot(draft, screenId, w) : null;
  const screen = draft.screens.find((s) => s.id === screenId);
  // the draft as the screen would show this widget there, a short pause after each change (as the screen preview)
  const [live, setLive] = useState<DisplayConfig | null>(null);
  const key = w && spot ? `${w.id}|${spot.place}|${spot.size}|${spot.corner}` : '';
  // built again after a test too: on Marco Cloud the tested copy of an unsaved image goes with it (livePreview.ts)
  const source = useMemo(() => (w && spot ? widgetPreviewDraft(draft, screenId, w.id, spot) : null), [draft, screenId, key, pick.tested]);
  useEffect(() => {
    const id = window.setTimeout(() => setLive(source ? draftDisplayConfig(source, screenId) : null), 150);
    return () => clearTimeout(id);
  }, [source, screenId]);
  if (!w || !spot) return null;
  const setPlace = (place: WidgetPreviewPlace) => setPreviewSpot({ ...spot, place, size: place === 'full' ? 'l' : spot.size });
  const setSize = (size: WidgetSize) => setPreviewSpot({ ...spot, size });
  const noSide = spot.place === 'side' && screen && !hasSideColumn(screen.layout.preset);
  return (
    <Preview
      {...rest}
      live={live}
      focus={w.id}
      zoom={spot.place !== 'full'}
      reload={pick.tested}
      title={t('Vista previa del widget')}
      tag={t('Solo vista previa')}
      choices={widgets.length > 1 ? widgets.map((x) => ({ value: x.id, label: x.name.trim() || t('Widget sin nombre') })) : undefined}
      chosen={w.id}
      onChoose={setPreviewWidget}
      hint={t('Muestra los cambios sin guardar. «Probar» lo carga de nuevo.')}
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
          {noSide && <p class="muted small">{t('Esta pantalla no tiene columna lateral: aquí se ve con el diseño Calendario grande. En la pantalla iría en su esquina.')}</p>}
          <p class="small">
            {t('Para ponerlo en una pantalla, ve a Diseño → Widgets en esta pantalla; allí eliges dónde va y su tamaño.')}{' '}
            <button
              type="button"
              class="link-btn"
              onClick={() => {
                setScreenId(screenId);
                rest.onClose && rest.variant === 'sheet' && rest.onClose();
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
