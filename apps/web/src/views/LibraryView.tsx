import { useTranslation } from 'react-i18next';
import { ExperimentCard } from '../components/ExperimentCard';

export function LibraryView() {
  const { t } = useTranslation();
  return (
    <section className="view view--library" aria-labelledby="library-title">
      <h1 id="library-title">{t('ui.library.title')}</h1>
      <p className="lead">{t('ui.library.intro')}</p>
      <div className="card-grid">
        <ExperimentCard />
      </div>
    </section>
  );
}
