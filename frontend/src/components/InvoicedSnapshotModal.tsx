import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import InvoicedSnapshotPanel from '@/components/InvoicedSnapshotPanel';

interface Props {
  visible: boolean;
  direction: 'receivable' | 'payable';
  partnerCode: string | null;
  partnerName: string | null;
  onCancel: () => void;
  canWrite: boolean;
}

export default function InvoicedSnapshotModal({
  visible,
  direction,
  partnerCode,
  partnerName,
  onCancel,
  canWrite
}: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t('snapshot.invoiceTitle', { name: partnerName ?? '' })}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={800}
      style={{ top: 20 }}
      destroyOnHidden
    >
      <InvoicedSnapshotPanel direction={direction} partnerCode={partnerCode} canWrite={canWrite} />
    </Modal>
  );
}
