import { useTranslation } from 'react-i18next';
import type { PracticalCapability } from '../engine/localAdapter';

/** LAB-011: what this practical's simulation supports, and what it leaves out. */
export function CapabilityNote({ capability }: { capability: PracticalCapability | undefined }) {
  const { t } = useTranslation();
  if (!capability) return null;
  return (
    <details className="capability-note">
      <summary>{t('capability.summary')}</summary>
      <p>
        {t('capability.modes')}{' '}
        {capability.modes.map((mode) => t(`ui.mode.${mode}.title`)).join(', ')}
      </p>
      {capability.unsupported.length > 0 && (
        <>
          <p>{t('capability.not_included')}</p>
          <ul aria-label={t('capability.not_included')}>
            {capability.unsupported.map((code) => (
              <li key={code}>{t(`capability.unsupported.${code}`)}</li>
            ))}
          </ul>
        </>
      )}
      <p className="hint-text">{t('capability.engine_results')}</p>
    </details>
  );
}
