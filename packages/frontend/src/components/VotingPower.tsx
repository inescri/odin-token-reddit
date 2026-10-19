import { useTranslation } from 'react-i18next';

import type { VotingPowerState } from '../hooks/useVotingPower';
import { formatCompactAmount } from '../lib/amounts';
import { useOdinConnect } from '../odin/useOdinConnect';
import { ui } from './ui';

export function VotingPower({ power, ticker, exponent }: { power: VotingPowerState; ticker: string; exponent: number }): React.JSX.Element | null {
  const { t } = useTranslation();
  const { status } = useOdinConnect();
  if (status !== 'connected') return null;

  let text: string;
  if (power.error) text = t('power.unavailable');
  else if (power.raw === null || (power.loading && power.raw === null)) text = t('power.loading');
  else if (power.raw === 0n) text = t('power.zero', { ticker });
  else text = t('power.value', { amount: formatCompactAmount(power.raw, exponent), ticker });

  return (
    <div style={{ ...ui.card, padding: '0.5rem 0.9rem', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }} title={t('power.approximate')}>
      <span>
        <strong>{t('power.label')}</strong>{' '}
        <span style={power.raw === 0n ? ui.muted : undefined}>{text}</span>
      </span>
      <button type="button" style={ui.link} onClick={power.refresh} disabled={power.loading}>{t('power.refresh')}</button>
    </div>
  );
}
