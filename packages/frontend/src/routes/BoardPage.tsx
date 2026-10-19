import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { ThreadSort } from '../api/types';
import { Composer } from '../components/Composer';
import { Pager } from '../components/Pager';
import { ThreadCard } from '../components/ThreadCard';
import { VotingPower } from '../components/VotingPower';
import { ui } from '../components/ui';
import { TokenMetaContext } from '../context/TokenMetaContext';
import { useThreads } from '../hooks/useThreads';
import { useToken } from '../hooks/useToken';
import { useVotingPower } from '../hooks/useVotingPower';
import { displayExponent } from '../lib/amounts';
import { tokenImageUrl } from '../lib/tokenImage';

const SORTS: ThreadSort[] = ['hot', 'top', 'new'];
const PAGE_SIZE = 25;

function parseSort(raw: string | null): ThreadSort {
  return raw === 'top' || raw === 'new' ? raw : 'hot';
}

export function BoardPage(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { tokenId } = useParams<{ tokenId: string }>();
  const [params, setParams] = useSearchParams();
  const sort = parseSort(params.get('sort'));
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const { token, loading: tokenLoading, error: tokenError } = useToken(tokenId);
  const threads = useThreads(tokenId, sort, page, PAGE_SIZE);
  const power = useVotingPower(tokenId);

  const setQuery = (next: { sort?: ThreadSort; page?: number }) => {
    const p = new URLSearchParams(params);
    if (next.sort) {
      if (next.sort === 'hot') p.delete('sort');
      else p.set('sort', next.sort);
      p.delete('page');
    }
    if (next.page !== undefined) {
      if (next.page > 1) p.set('page', String(next.page));
      else p.delete('page');
    }
    setParams(p, { replace: true });
  };

  if (!tokenId) return null;
  if (tokenError) {
    return (
      <section>
        <p role="alert" style={ui.error}>{t('board.tokenError', { message: tokenError })}</p>
        <Link to="/">{t('board.backHome')}</Link>
      </section>
    );
  }

  const meta = token ? { tokenId, ticker: token.ticker, divisibility: token.divisibility, decimals: token.decimals } : null;
  const exponent = token ? displayExponent(token) : 0;

  return (
    <TokenMetaContext.Provider value={meta}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <img src={tokenImageUrl(tokenId)} alt="" width={48} height={48} style={{ borderRadius: '50%', objectFit: 'cover', background: '#eee' }} />
          <div>
            <h2 style={{ margin: 0 }}>
              {token ? token.name : tokenLoading ? t('board.loadingToken') : tokenId}{' '}
              {token ? <span style={ui.muted}>{token.ticker}</span> : null}
            </h2>
            <div style={ui.muted}>
              {t('board.threadCount', { count: threads.total })}
              {token ? ` · ${t('home.holders', { count: token.holder_count })}` : ''}
            </div>
          </div>
        </header>

        {token ? <VotingPower power={power} ticker={token.ticker} exponent={exponent} /> : null}

        {token ? (
          <Composer
            mode="thread"
            submitLabel={t('composer.postThread')}
            onSubmit={({ title, body }) => threads.create({ title, body, token: { divisibility: token.divisibility, decimals: token.decimals } })}
          />
        ) : null}

        <nav aria-label={t('board.sortLabel')} style={{ display: 'flex', gap: '0.5rem' }}>
          {SORTS.map((s) => (
            <button key={s} type="button" style={ui.tab(sort === s)} aria-pressed={sort === s} onClick={() => setQuery({ sort: s })}>
              {t(`board.sort.${s}`)}
            </button>
          ))}
        </nav>

        {threads.error ? <p role="alert" style={ui.error}>{t('board.loadError', { message: threads.error })}</p> : null}
        {threads.loading && threads.items.length === 0 ? <p style={ui.muted}>{t('board.loading')}</p> : null}
        {!threads.loading && threads.items.length === 0 && !threads.error ? (
          <p style={ui.muted}>{t('board.empty')}</p>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', opacity: threads.loading ? 0.6 : 1 }}>
          {threads.items.map((thread) => (
            <ThreadCard key={thread.id} thread={thread} onChange={threads.replace} onVoted={power.refresh} />
          ))}
        </div>

        <Pager page={page} pageSize={PAGE_SIZE} total={threads.total} onPage={(p) => setQuery({ page: p })} />
      </section>
    </TokenMetaContext.Provider>
  );
}
