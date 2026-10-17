import type { UseSimpleApiReturn } from '@/hooks/types';
import InvoicedSnapshotModal from '@/components/InvoicedSnapshotModal';

interface InvoicedModalProps {
  readonly visible: boolean;
  readonly supplierCode: string | null;
  readonly supplierName: string | null;
  readonly onCancel: () => void;
  readonly apiInstance: UseSimpleApiReturn;
  readonly canWrite: boolean;
}

export default function InvoicedModal(props: InvoicedModalProps) {
  return (
    <InvoicedSnapshotModal
      visible={props.visible}
      direction="payable"
      partnerCode={props.supplierCode}
      partnerName={props.supplierName}
      onCancel={props.onCancel}
      canWrite={props.canWrite}
    />
  );
}
