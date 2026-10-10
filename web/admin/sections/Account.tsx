// Account page for multi-tenant servers (Marco Cloud). It takes the place of the Security page: sign-in,
// sessions and account removal live on the account pages, and the admin only renames the household.
// Loaded lazily by App.tsx, so self-hosted installs never download it.
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { accountLinks, cleanHouseholdName, HOUSEHOLD_NAME_MAX } from '../authRedirect';
import { toast } from '../components/feedback';
import { Icon } from '../components/icons';
import { Button, Callout, Card, Field, PageHeader, TextInput } from '../components/ui';
import { t } from '../i18n';
import type { SectionProps } from './common';

export function AccountSection({ me, updateMe }: SectionProps) {
  const user = me.user;
  const household = me.account?.household ?? null;
  const links = accountLinks(me);
  const owner = household?.role === 'owner';
  const [name, setName] = useState(household?.name ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(household?.name ?? ''), [household?.name]);
  const clean = cleanHouseholdName(name);
  const changed = !!household && clean !== household.name;

  const rename = async (e: Event) => {
    e.preventDefault();
    if (!clean || !changed || busy) return;
    setBusy(true);
    try {
      const r = await api.renameHousehold(clean);
      const next = r?.household?.name ? r.household : { ...household!, name: clean };
      if (me.account) updateMe?.({ ...me, account: { ...me.account, household: next } });
      setName(next.name);
      toast(t('Nombre del hogar guardado'));
    } catch (err) {
      const ae = err as ApiError;
      if (ae.status !== 401) toast(`${t('No se pudo guardar')}: ${ae.message === 'network' ? t('servidor no disponible') : ae.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('Cuenta')} desc={t('Tu cuenta y el hogar que gestionas desde este panel.')} />
      {user && (
        <Card>
          <div class="who">
            {user.picture ? <img class="avatar avatar--lg" src={user.picture} alt="" referrerpolicy="no-referrer" /> : <span class="avatar avatar--lg avatar--letter">{(user.name || user.email || 'A')[0].toUpperCase()}</span>}
            <div>
              <strong>{user.name || user.email}</strong>
              <div class="muted small">
                {user.email} · {t('sesión con tu cuenta')}
              </div>
            </div>
          </div>
        </Card>
      )}
      {!household && <Callout kind="warn">{t('No se pudieron cargar los datos de la cuenta. Recarga la página.')}</Callout>}
      {household && (
        <Card id="acc-household" title={t('Hogar')} icon="home" desc={owner ? t('El nombre aparece en tu cuenta y en los correos.') : t('Solo el propietario puede cambiar el nombre.')}>
          <form class="account-rename" onSubmit={rename}>
            <Field label={t('Nombre del hogar')} htmlFor="acc-household-name" hint={`${t('Tu rol')}: ${roleLabel(household.role)}`} error={owner && name && !clean ? 'Escribe un nombre' : undefined}>
              <TextInput id="acc-household-name" value={name} onValue={setName} maxLength={HOUSEHOLD_NAME_MAX} disabled={!owner || busy} autocomplete="off" />
            </Field>
            {owner && (
              <Button type="submit" variant="primary" icon="check" loading={busy} disabled={!clean || !changed}>
                {t('Guardar nombre')}
              </Button>
            )}
          </form>
        </Card>
      )}
      {links && (
        <Card id="acc-links" title={t('Cuenta y sesiones')} icon="user" desc={t('Se abren en las páginas de tu cuenta.')}>
          <div class="account-links">
            {links.account && (
              <a class="btn btn--default" href={links.account}>
                <Icon name="user" size={17} />
                <span>{t('Gestionar cuenta')}</span>
              </a>
            )}
            {links.sessions && (
              <a class="btn btn--default" href={links.sessions}>
                <Icon name="shield" size={17} />
                <span>{t('Sesiones abiertas')}</span>
              </a>
            )}
            {links.remove && (
              <a class="btn btn--danger" href={links.remove}>
                <Icon name="trash" size={17} />
                <span>{t('Eliminar cuenta')}</span>
              </a>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

function roleLabel(role: string): string {
  return role === 'owner' ? t('Propietario') : t('Miembro');
}
