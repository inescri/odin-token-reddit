import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Pager } from '../components/Pager';
import { ui } from '../components/ui';
import { BOARDS_PAGE_SIZE, useBoards } from '../hooks/useBoards';
import { tokenImageUrl } from '../lib/tokenImage';

export function HomePage(): React.JSX.Element {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const boards = useBoards(search, page);

  const update = (next: { q?: string; page?: number }) => {
    const p = new URLSearchParams(params);
    if (next.q !== undefined) {
      if (next.q) p.set('q', next.q);
      else p.delete('q');
      p.delete('page');
    }
    if (next.page !== undefined) {
      if (next.page > 1) p.set('page', String(next.page));
      else p.delete('page');
    }
    setParams(p, { replace: true });
  };

  return (
    <section>
      <p style={ui.muted}>{t('app.intro')}</p>
      <input
        style={{ ...ui.input, marginBottom: '1rem' }}
        type="search"
        value={search}
        onChange={(e) => update({ q: e.target.value })}
        placeholder={t('home.searchPlaceholder')}
        aria-label={t('home.searchPlaceholder')}
      />
      {boards.error ? <p role="alert" style={ui.error}>{t('home.loadError', { message: boards.error })}</p> : null}
      {boards.loading && boards.items.length === 0 ? <p style={ui.muted}>{t('home.loading')}</p> : null}
      {!boards.loading && boards.items.length === 0 && !boards.error ? <p style={ui.muted}>{t('home.empty')}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem', opacity: boards.loading ? 0.6 : 1 }}>
        {boards.items.map(({ token, threadCount }) => (
          <Link key={token.id} to={`/b/${encodeURIComponent(token.id)}`} style={{ ...ui.card, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
            <img
              src={tokenImageUrl(token.id)}
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: '50%', objectFit: 'cover', background: '#eee', flexShrink: 0 }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {token.name} <span style={ui.muted}>{token.ticker}</span>
              </div>
              <div style={ui.muted}>
                {t('home.holders', { count: token.holder_count })} · {t('home.threads', { count: threadCount })}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Pager page={page} pageSize={BOARDS_PAGE_SIZE} total={boards.total} onPage={(p) => update({ page: p })} />
    </section>
  );
}
