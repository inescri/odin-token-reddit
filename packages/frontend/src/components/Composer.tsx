import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../api/client';
import { useOdinConnect } from '../odin/useOdinConnect';
import { ui } from './ui';

export const TITLE_MAX = 200;
export const THREAD_BODY_MAX = 10_000;
export const COMMENT_BODY_MAX = 5_000;

interface BaseProps {
  submitLabel: string;
  onCancel?: () => void;
  autoFocus?: boolean;
  initialTitle?: string;
  initialBody?: string;
}

interface ThreadComposerProps extends BaseProps {
  mode: 'thread';
  onSubmit: (input: { title: string; body: string }) => Promise<unknown>;
}

interface CommentComposerProps extends BaseProps {
  mode: 'comment';
  onSubmit: (input: { body: string }) => Promise<unknown>;
}

export type ComposerProps = ThreadComposerProps | CommentComposerProps;

const counter = (len: number, max: number): React.CSSProperties => ({
  ...ui.muted,
  fontSize: '0.75rem',
  color: len > max ? '#c0392b' : '#666',
  textAlign: 'right',
});

export function Composer(props: ComposerProps): React.JSX.Element {
  const { t } = useTranslation();
  const { status, connect } = useOdinConnect();
  const [title, setTitle] = useState(props.initialTitle ?? '');
  const [body, setBody] = useState(props.initialBody ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedIn = status === 'connected';
  const bodyMax = props.mode === 'thread' ? THREAD_BODY_MAX : COMMENT_BODY_MAX;
  const titleOk = props.mode !== 'thread' || (title.trim().length > 0 && title.trim().length <= TITLE_MAX);
  const bodyOk = props.mode === 'thread' ? body.length <= bodyMax : body.trim().length > 0 && body.length <= bodyMax;
  const canSubmit = signedIn && titleOk && bodyOk && !busy;

  if (!signedIn) {
    return (
      <div style={{ ...ui.card, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={ui.muted}>{props.mode === 'thread' ? t('composer.signInThread') : t('composer.signInComment')}</span>
        <button type="button" style={ui.primary} onClick={connect} disabled={status === 'connecting' || status === 'restoring'}>
          {t('auth.connect')}
        </button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (props.mode === 'thread') await props.onSubmit({ title: title.trim(), body });
      else await props.onSubmit({ body });
      setTitle('');
      setBody('');
      props.onCancel?.();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'COOLDOWN' ? t('composer.cooldown', { message: err.message }) : t('composer.failed', { message: err.message }));
      } else {
        setError(t('composer.failed', { message: err instanceof Error ? err.message : '' }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {props.mode === 'thread' ? (
        <>
          <input
            style={ui.input}
            value={title}
            autoFocus={props.autoFocus}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('composer.titlePlaceholder')}
            aria-label={t('composer.titlePlaceholder')}
            maxLength={TITLE_MAX + 50}
          />
          <span style={counter(title.trim().length, TITLE_MAX)}>{title.trim().length}/{TITLE_MAX}</span>
        </>
      ) : null}
      <textarea
        style={{ ...ui.input, minHeight: props.mode === 'thread' ? 120 : 72, resize: 'vertical' }}
        value={body}
        autoFocus={props.mode === 'comment' && props.autoFocus}
        onChange={(e) => setBody(e.target.value)}
        placeholder={props.mode === 'thread' ? t('composer.bodyPlaceholder') : t('composer.commentPlaceholder')}
        aria-label={props.mode === 'thread' ? t('composer.bodyPlaceholder') : t('composer.commentPlaceholder')}
      />
      <span style={counter(body.length, bodyMax)}>{body.length}/{bodyMax}</span>
      {error ? <span role="alert" style={ui.error}>{error}</span> : null}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        {props.onCancel ? (
          <button type="button" style={ui.secondary} onClick={props.onCancel} disabled={busy}>{t('composer.cancel')}</button>
        ) : null}
        <button type="submit" style={{ ...ui.primary, ...(canSubmit ? {} : ui.disabled) }} disabled={!canSubmit}>
          {busy ? t('composer.submitting') : props.submitLabel}
        </button>
      </div>
    </form>
  );
}
