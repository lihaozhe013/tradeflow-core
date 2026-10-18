import { useCallback, useEffect, useState } from 'react';
import { ClockCircleOutlined, RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/utils/request';
import './PendingDraftLink.css';

interface PendingDraftLinkProps {
  readonly direction: 'inbound' | 'outbound';
}

interface DraftCountResponse {
  readonly pagination: { readonly total: number };
}

export default function PendingDraftLink({ direction }: PendingDraftLinkProps): React.ReactElement {
  const { t } = useTranslation();
  const [count, setCount] = useState<number | null>(null);
  const loadCount = useCallback(async () => {
    try {
      const response = await apiRequest.get<DraftCountResponse>(
        `/transaction-drafts?direction=${direction}&status=pending&page=1&limit=1`
      );
      setCount(response.pagination.total);
    } catch {
      setCount(null);
    }
  }, [direction]);

  useEffect(() => {
    void loadCount();
    window.addEventListener('focus', loadCount);
    return () => window.removeEventListener('focus', loadCount);
  }, [loadCount]);

  const isActive = count !== null && count > 0;
  const displayCount = count === null ? '—' : count > 99 ? '99+' : count;
  const accessibleLabel =
    count === null
      ? t('transactionDrafts.openQueue')
      : t('transactionDrafts.openQueueWithCount', { count });

  return (
    <>
      <Link
        className={`pending-draft-link${isActive ? ' pending-draft-link--active' : ''}`}
        to={`/transaction-drafts?direction=${direction}`}
        aria-label={accessibleLabel}
      >
        <span className="pending-draft-link__icon" aria-hidden="true">
          <ClockCircleOutlined />
        </span>
        <span className="pending-draft-link__label">{t('transactionDrafts.openQueue')}</span>
        <span className="pending-draft-link__count" aria-hidden="true">
          {displayCount}
        </span>
        <RightOutlined className="pending-draft-link__arrow" aria-hidden="true" />
      </Link>
      <span
        className="pending-draft-link__status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {count === null ? '' : t('transactionDrafts.pendingCount', { count })}
      </span>
    </>
  );
}
