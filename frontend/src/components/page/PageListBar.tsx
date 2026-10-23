import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface PageListBarProps {
  readonly total: number;
  readonly label?: string;
  readonly selectedCount?: number;
  readonly onClearSelection?: () => void;
  readonly extra?: ReactNode;
}

/**
 * Summary strip between the filter toolbar and the record table. It reports the
 * number of matching records and offers a shortcut to drop the current selection.
 */
function PageListBar({
  total,
  label,
  selectedCount = 0,
  onClearSelection,
  extra
}: PageListBarProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="page-list-bar">
      <div className="page-list-summary">
        <span className="page-list-heading">{label ?? t('common.recordsHeading')}</span>
        <span className="page-list-count">{t('common.totalCount', { count: total })}</span>
        {extra}
      </div>
      {selectedCount > 0 ? (
        <div className="page-list-selection" role="status" aria-live="polite">
          <span>{t('common.selectedCount', { count: selectedCount })}</span>
          {onClearSelection ? (
            <button type="button" className="page-list-clear" onClick={onClearSelection}>
              {t('common.clearSelection')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default PageListBar;
