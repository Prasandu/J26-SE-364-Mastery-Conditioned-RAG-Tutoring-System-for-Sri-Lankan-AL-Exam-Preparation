import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../components/ui/Icon';
import type { AdminSection } from './AdminView';

const NAV: { group: string; items: { id: AdminSection; icon: IconName }[] }[] = [
  {
    group: 'admin.group.content',
    items: [
      { id: 'overview', icon: 'layers' },
      { id: 'library', icon: 'book' },
      { id: 'simulations', icon: 'flask' },
      { id: 'import', icon: 'clipboard' },
      { id: 'drafts', icon: 'search' },
      { id: 'review', icon: 'check' },
    ],
  },
  {
    group: 'admin.group.knowledge',
    items: [
      { id: 'knowledge', icon: 'flask' },
      { id: 'translations', icon: 'globe' },
    ],
  },
  {
    group: 'admin.group.system',
    items: [
      { id: 'users', icon: 'shield' },
      { id: 'audit', icon: 'alert' },
      { id: 'settings', icon: 'compass' },
    ],
  },
];

export function AdminNavigation({
  section,
  canReview,
  onNavigate,
}: {
  section: AdminSection;
  canReview: boolean;
  onNavigate: (section: AdminSection) => void;
}) {
  const { t } = useTranslation();
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 901px)');
    const closeOnDesktop = () => {
      if (desktop.matches && drawer.current?.open) drawer.current.close();
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      document.body.classList.remove('admin-drawer-open');
    };
  }, []);

  const navigation = (mobile: boolean) => (
    <nav className="admin-nav" aria-label={t('admin.sections')}>
      {NAV.map((group) => (
        <div key={group.group} className="admin-nav__group">
          <p className="admin-nav__label">{t(group.group)}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={section === item.id ? 'admin-nav__item is-active' : 'admin-nav__item'}
                  aria-current={section === item.id ? 'page' : undefined}
                  disabled={item.id === 'review' && !canReview}
                  onClick={() => {
                    onNavigate(item.id);
                    if (mobile) {
                      drawer.current?.close();
                      // Wait for the section to render before placing keyboard focus in it.
                      requestAnimationFrame(() =>
                        document.getElementById('admin-content')?.focus(),
                      );
                    }
                  }}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{t(`admin.section.${item.id}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <div className="admin-mobile-bar">
        <button
          ref={trigger}
          type="button"
          className="button"
          aria-haspopup="dialog"
          aria-controls="admin-drawer"
          onClick={() => {
            drawer.current?.showModal();
            document.body.classList.add('admin-drawer-open');
          }}
        >
          <Icon name="layers" size={18} /> {t('admin.navigation.open')}
        </button>
        <span>{t(`admin.section.${section}`)}</span>
      </div>
      <aside className="admin-sidebar">{navigation(false)}</aside>
      <dialog
        ref={drawer}
        id="admin-drawer"
        className="admin-drawer"
        aria-labelledby="admin-drawer-title"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled');
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => {
          document.body.classList.remove('admin-drawer-open');
          if (!window.matchMedia('(min-width: 901px)').matches) trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX > bounds.right || event.clientY > bounds.bottom) {
            event.currentTarget.close();
          }
        }}
      >
        <div className="admin-drawer__head">
          <h2 id="admin-drawer-title">{t('admin.sections')}</h2>
          <button type="button" className="button" onClick={() => drawer.current?.close()}>
            {t('admin.navigation.close')}
          </button>
        </div>
        {navigation(true)}
      </dialog>
    </>
  );
}
