import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/utils/request';

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

  return (
    <Button>
      <Link to={`/transaction-drafts?direction=${direction}`}>
        <Badge count={count ?? 0} showZero>
          {t('transactionDrafts.openQueue')}
        </Badge>
      </Link>
    </Button>
  );
}
