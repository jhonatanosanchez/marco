// Help and feedback (Marco Cloud, features.feedback): a short form that reaches the people who run the server, with
// the signed in email as reply-to, and a link to GitHub issues for those who prefer to report in public.
// Limits and the technical details are in ../feedbackForm.ts (tested).
import { useState } from 'preact/hooks';
import type { FeedbackKind, FeedbackMeta } from '../../shared/types';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { FEEDBACK_MAX, feedbackBody, GITHUB_ISSUES_URL, messageError, messageLength, metaRows } from '../feedbackForm';
import { toast } from './feedback';
import { Icon } from './icons';
import { Button, Field, Modal, Segmented, Textarea } from './ui';

const PLACEHOLDER: Record<FeedbackKind, string> = {
  problem: 'Qué estabas haciendo, qué esperabas y qué pasó.',
  idea: 'Qué te gustaría que hiciera Marco y para qué lo usarías.',
  other: 'Escribe lo que quieras contarnos.',
};

export function FeedbackDialog(props: { email: string; meta: FeedbackMeta; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('problem');
  const [message, setMessage] = useState('');
  const [withMeta, setWithMeta] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showError, setShowError] = useState(false);
  const error = messageError(message);
  const rows = metaRows(props.meta);

  const send = async () => {
    if (error) {
      setShowError(true);
      return;
    }
    setSending(true);
    try {
      await api.sendFeedback(feedbackBody(kind, message, props.meta, withMeta));
      setSent(true);
    } catch (e) {
      const err = e as ApiError;
      toast(err.status === 0 ? t('Sin conexión con el servidor') : err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Modal title={t('Ayuda y comentarios')} icon="help" size="md" onClose={props.onClose} autoFocus={false} footer={<Button variant="primary" onClick={props.onClose}>{t('Cerrar')}</Button>}>
        <div class="fb-done">
          <span class="fb-done__icon">
            <Icon name="check" size={26} />
          </span>
          <h4>{t('Gracias, lo leeremos.')}</h4>
          {props.email && <p class="muted">{t('Si hace falta, te contestaremos a {email}.', { email: props.email })}</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={t('Ayuda y comentarios')}
      icon="help"
      size="md"
      onClose={props.onClose}
      dirty={messageLength(message) > 0}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose} disabled={sending}>
            {t('Cancelar')}
          </Button>
          <Button variant="primary" icon="check" loading={sending} onClick={send}>
            {t('Enviar')}
          </Button>
        </>
      }
    >
      <div class="fb">
        <p class="muted fb__intro">{t('Cuéntanos qué ha fallado o qué echas en falta. Lo leemos todo, aunque no siempre podamos contestar.')}</p>
        <Field label={t('Tipo')}>
          <Segmented<FeedbackKind>
            full
            value={kind}
            onChange={setKind}
            options={[
              { value: 'problem', label: t('Problema'), icon: 'alert' },
              { value: 'idea', label: t('Idea'), icon: 'sparkles' },
              { value: 'other', label: t('Otra cosa'), icon: 'message' },
            ]}
          />
        </Field>
        <Field label={t('Mensaje')} error={showError && error ? error : undefined}>
          <Textarea value={message} onValue={setMessage} rows={6} maxLength={FEEDBACK_MAX} placeholder={t(PLACEHOLDER[kind])} />
          <div class="fb__count muted small">
            {messageLength(message)}/{FEEDBACK_MAX}
          </div>
        </Field>
        {props.email && (
          <Field label={t('Te contestaremos a')}>
            <div class="fb__reply">
              <Icon name="user" size={15} />
              <span>{props.email}</span>
            </div>
          </Field>
        )}
        <div class={`fb__meta ${withMeta ? 'is-on' : ''}`}>
          <label class="fb__check">
            <input type="checkbox" checked={withMeta} onChange={(e) => setWithMeta(e.currentTarget.checked)} />
            <span class="check-box">
              <Icon name="check" size={12} />
            </span>
            <span>{t('Incluir información técnica')}</span>
          </label>
          <p class="muted small fb__meta-note">{withMeta ? t('Esto es exactamente lo que se enviará con tu mensaje:') : t('Solo se enviará tu mensaje.')}</p>
          {withMeta && (
            <dl class="fb__list">
              {rows.map(([k, v]) => (
                <>
                  <dt>{t(k)}</dt>
                  <dd>{v}</dd>
                </>
              ))}
            </dl>
          )}
        </div>
        <div class="fb__github">
          <a class="link-btn" href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={14} /> {t('Abrir un issue en GitHub')}
          </a>
          <p class="muted small">{t('Los issues de GitHub son públicos: no pongas datos personales, direcciones ni enlaces privados.')}</p>
        </div>
      </div>
    </Modal>
  );
}
