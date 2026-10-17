import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AuthBar } from '../components/AuthBar';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useSession } from '../hooks/useSession';

export function Layout() {
  const { t } = useTranslation();
  const session = useSession();
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '0 auto', padding: '1rem 1rem 3rem' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>{t('app.title')}</Link>
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
          <LanguageSwitcher />
          <AuthBar />
        </div>
      </header>
      {session.status === 'error' ? (
        <p role="alert" style={{ color: '#c0392b' }}>
          {t('session.error', { message: session.error ?? '' })}{' '}
          <button type="button" onClick={session.retry}>{t('session.retry')}</button>
        </p>
      ) : null}
      <main>
        <Outlet />
      </main>
    </div>
  );
}
