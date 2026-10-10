import type { SourceRef } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { sources } from '../engine/content';
import { dedupeRefs } from '../lib/format';

/** Compact source attribution: document title with PDF and printed page. */
export function SourceList({ refs }: { refs: readonly SourceRef[] }) {
  const { t } = useTranslation();
  const unique = dedupeRefs(refs);
  if (unique.length === 0) return null;
  return (
    <p className="source-list">
      <span className="source-list__label">{t('ui.source.label')}</span>{' '}
      {unique.map((r, i) => {
        const doc = sources.documents.find((d) => d.sourceId === r.sourceId);
        return (
          <span key={`${r.sourceId}:${r.pdfPage}`}>
            {i > 0 && '; '}
            {r.printedPage === null
              ? t('ui.source.citation_pdf', {
                  title: doc ? t(doc.titleKey) : r.sourceId,
                  pdf: r.pdfPage,
                })
              : t('ui.source.citation', {
                  title: doc ? t(doc.titleKey) : r.sourceId,
                  pdf: r.pdfPage,
                  printed: r.printedPage,
                })}
          </span>
        );
      })}
    </p>
  );
}
