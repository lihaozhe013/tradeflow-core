import { Card, Row, Col, Typography, Spin, Alert, Image } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSimpleApiData } from '@/hooks/useSimpleApi';

const { Title, Paragraph, Text } = Typography;

function About() {
  const { t } = useTranslation();
  const {
    data: aboutData,
    loading,
    error
  } = useSimpleApiData('/about', {
    title: '',
    company: {
      name: '',
      description: '',
      slogan: ''
    },
    system: {
      version: '0.1.0',
      releaseDate: '2025-01-01',
      techStack: 'React + Node.js + SQLite',
      team: ''
    },
    contact: {
      email: 'example@example.com',
      phone: '+1 xxx-xxx-xxxx',
      address: ''
    }
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message={t('about.loadFailed')}
        description={error}
        type="error"
        showIcon
        style={{ margin: '20px' }}
      />
    );
  }

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '8px' }}>
      <Row gutter={[32, 32]} align="middle">
        <Col xs={24} md={16}>
          <Title level={1} style={{ color: '#1890ff', marginBottom: '24px' }}>
            {aboutData?.title ?? t('about.title')}
          </Title>
          
          <div style={{ marginBottom: '32px' }}>
            <Title level={3} style={{ color: '#333' }}>
              {aboutData?.company?.name ?? t('about.companyProfile')}
            </Title>
            <Paragraph style={{ fontSize: '16px', lineHeight: '1.8', color: '#555' }}>
              {aboutData?.company?.description ?? t('about.defaultDescription')}
            </Paragraph>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <Title level={3} style={{ color: '#333' }}>
              {t('about.systemInfo')}
            </Title>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text strong>{t('about.systemVersion')}: </Text>
                <Text>{aboutData?.system?.version ?? '0.1.0'}</Text>
              </Col>
              <Col span={12}>
                <Text strong>{t('about.releaseDate')}: </Text>
                <Text>{aboutData?.system?.releaseDate ?? '2025-01-01'}</Text>
              </Col>
              <Col span={12}>
                <Text strong>{t('about.techStack')}: </Text>
                <Text>{aboutData?.system?.techStack ?? 'React + Node.js + SQLite'}</Text>
              </Col>
              <Col span={12}>
                <Text strong>{t('about.development')}: </Text>
                <Text>{aboutData?.system?.team ?? t('about.devTeam')}</Text>
              </Col>
            </Row>
          </div>

          <div>
            <Title level={3} style={{ color: '#333' }}>
              {t('about.contact')}
            </Title>
            <Paragraph style={{ fontSize: '16px', lineHeight: '1.8', color: '#555' }}>
              <Text strong>{t('about.email')}: </Text>{aboutData?.contact?.email ?? 'example@example.com'}<br />
              <Text strong>{t('about.phone')}: </Text>{aboutData?.contact?.phone ?? '+1 xxx-xxx-xxxx'}<br />
              <Text strong>{t('about.address')}: </Text>{aboutData?.contact?.address ?? t('about.defaultAddress')}
            </Paragraph>
          </div>
        </Col>
        
        <Col xs={24} md={8} style={{ textAlign: 'center' }}>
          <Card
            style={{ 
              background: 'linear-gradient(135deg, rgba(223, 218, 215, 0.2) 0%, rgba(223, 218, 215, 0.2) 100%)',
              border: 'none',
              borderRadius: '12px',
              padding: '20px'
            }}
          >
            <Image
              src="/logo.svg"
              alt="Company Logo"
              style={{ 
                width: '300px',
                height: '300px',
                objectFit: 'contain'
              }}
              preview={false}
            />
            <Title 
              level={4} 
              style={{ 
                color: '#000000ff', 
                marginTop: '20px',
                textAlign: 'center' 
              }}
            >
              {aboutData?.company?.name ?? t('about.systemName')}
            </Title>
            <Paragraph style={{ color: '#000000ff', textAlign: 'center' }}>
              {aboutData?.company?.slogan ?? t('about.systemSlogan')}
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default About;
