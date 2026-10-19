import { useTranslation } from 'react-i18next';

import type { VoteDirection, VoteOutcome } from '../api/types';
import { useTokenMeta } from '../context/TokenMetaContext';
import { useVote } from '../hooks/useVote';
import type { VoteTarget } from '../hooks/useVote';
import { formatCompactAmount, formatSignedAmount } from '../lib/amounts';
import { useOdinConnect } from '../odin/useOdinConnect';
import { ui } from './ui';

export interface VoteControlProps {
  target: VoteTarget;
  score: bigint;
  upCount: number;
  downCount: number;
  myVote: VoteDirection | null;
  deleted?: boolean;
  compact?: boolean;
  onOutcome: (outcome: VoteOutcome) => void;
  /** Called after a successful vote so voting-power displays can refresh. */
  onVoted?: () => void;
}

const arrow = (active: boolean, disabled: boolean, color: string): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '1.1rem',
  lineHeight: 1,
  padding: '0.1rem 0.3rem',
  color: active ? color : '#999',
  fontWeight: active ? 700 : 400,
  opacity: disabled ? 0.5 : 1,
});

export function VoteControl(props: VoteControlProps) {
  const { t } = useTranslation();
  const meta = useTokenMeta();
  const { connect } = useOdinConnect();
  const voting = useVote(meta?.tokenId);
  const exponent = meta ? meta.divisibility + meta.decimals : 0;
  const disabled = voting.pending || Boolean(props.deleted);

  const cast = async (direction: VoteDirection) => {
    if (voting.needsSignIn) {
      connect();
      return;
    }
    const outcome = await voting.vote(props.target, direction, props.myVote);
    if (outcome) {
      props.onOutcome(outcome);
      props.onVoted?.();
    }
  };

  const message = (() => {
    if (voting.error) {
      switch (voting.error.code) {
        case 'NO_BALANCE': return t('vote.noBalance', { ticker: meta?.ticker ?? '' });
        case 'BALANCE_UNAVAILABLE': return t('vote.balanceUnavailable');
        case 'DELETED': return t('vote.deleted');
        case 'SESSION': return t('vote.session');
        default: return t('vote.failed', { message: voting.error.message });
      }
    }
    if (voting.lastApplied !== null) {
      return t('vote.applied', { amount: formatCompactAmount(voting.lastApplied, exponent), ticker: meta?.ticker ?? '' });
    }
    return null;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: props.compact ? 56 : 72, flexShrink: 0 }}>
      <button type="button" aria-label={t('vote.up')} aria-pressed={props.myVote === 'up'} disabled={disabled} style={arrow(props.myVote === 'up', disabled, '#f7931a')} onClick={() => void cast('up')}>▲</button>
      <strong title={`${t('vote.scoreTitle')}: ${formatSignedAmount(props.score, exponent)}`} style={{ fontSize: props.compact ? '0.9rem' : '1rem', fontVariantNumeric: 'tabular-nums' }}>
        {formatSignedAmount(props.score, exponent, { abbreviate: true })}
      </strong>
      <button type="button" aria-label={t('vote.down')} aria-pressed={props.myVote === 'down'} disabled={disabled} style={arrow(props.myVote === 'down', disabled, '#3867d6')} onClick={() => void cast('down')}>▼</button>
      <span style={{ ...ui.muted, fontSize: '0.75rem', whiteSpace: 'nowrap' }} title={t('vote.rawTitle')}>
        {formatCompactAmount(BigInt(props.upCount), 0, { abbreviate: true })}↑{' '}
        {formatCompactAmount(BigInt(props.downCount), 0, { abbreviate: true })}↓
      </span>
      {voting.needsSignIn ? <span style={{ ...ui.muted, fontSize: '0.7rem', textAlign: 'center' }}>{t('vote.signIn')}</span> : null}
      {message ? (
        <span role="status" style={{ ...(voting.error ? ui.error : ui.muted), fontSize: '0.75rem', textAlign: 'center', maxWidth: 140 }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
