import type { UseSimpleApiReturn } from '@/hooks/types';
import InvoicedSnapshotModal from '@/components/InvoicedSnapshotModal';

interface InvoicedModalProps {
  readonly visible: boolean;
  readonly customerCode: string | null;
  readonly customerName: string | null;
  readonly onCancel: () => void;
  readonly apiInstance: UseSimpleApiReturn;
  readonly canWrite: boolean;
}

export default function InvoicedModal(props: InvoicedModalProps) {
  return (
    <InvoicedSnapshotModal
      visible={props.visible}
      direction="receivable"
      partnerCode={props.customerCode}
      partnerName={props.customerName}
      onCancel={props.onCancel}
      canWrite={props.canWrite}
    />
  );
}
