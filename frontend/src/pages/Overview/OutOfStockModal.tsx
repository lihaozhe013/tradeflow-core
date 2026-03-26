import { Modal, List, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { OutOfStockProduct } from '@/pages/Overview/types';

const { Text } = Typography;

type OutOfStockModalProps = {
  visible: boolean;
  onClose: () => void;
  products: OutOfStockProduct[];
};

const OutOfStockModal = ({ visible, onClose, products }: OutOfStockModalProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={t('overview.outOfStockDetails')}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={480}
    >
      {products && products.length > 0 ? (
        <List<OutOfStockProduct>
          dataSource={products}
          renderItem={(item) => (
            <List.Item>
              <Text>{item.product_model}</Text>
            </List.Item>
          )}
        />
      ) : (
        <div style={{ textAlign: 'center', color: '#52c41a', fontSize: 18, padding: '32px 0' }}>
          {t('overview.inventoryNormal')}
        </div>
      )}
    </Modal>
  );
};

export default OutOfStockModal;
