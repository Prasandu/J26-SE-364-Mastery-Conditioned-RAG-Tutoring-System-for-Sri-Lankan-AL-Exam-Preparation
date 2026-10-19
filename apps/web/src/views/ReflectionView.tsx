import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { useSession } from '../store/StoreProvider';
import { ReflectionFields } from '../workbench/notebook/ReflectionFields';

/**
 * Post-lab reflection: the handbook's post-lab question groups, as authored content references
 * (CLAUDE.md). Answers are free text, stored locally like pre-lab answers; no answer key is shown
 * here or anywhere else in the student app yet, so nothing is revealed early or late.
 */
export function ReflectionView() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  if (!session) return <p>{t('ui.workbench.no_session')}</p>;

  return (
    <section className="view view--reflection" aria-labelledby="reflection-title">
      <h1 id="reflection-title" className="visually-hidden">
        {t('ui.reflection.title')}
      </h1>
      <section className="card" aria-labelledby="reflection-questions">
        <h2 id="reflection-questions" className="card__title">
          <Icon name="compass" /> {t('ui.reflection.questions')}
        </h2>
        <ReflectionFields />
      </section>
    </section>
  );
}
