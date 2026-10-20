import { useTranslation } from 'react-i18next';

import { ui } from './ui';

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }): React.JSX.Element | null {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' }}>
      <button type="button" style={ui.secondary} disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('pager.prev')}</button>
      <span style={ui.muted}>{t('pager.of', { page, pages })}</span>
      <button type="button" style={ui.secondary} disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('pager.next')}</button>
    </nav>
  );
}
