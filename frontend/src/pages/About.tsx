import PageHeader from '@/components/page/PageHeader';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Row, Col, Typography, Spin, Alert, Image } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSimpleApiData } from '@/hooks/useSimpleApi';

const { Text } = Typography;

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
      version: '',
      releaseDate: '',
      techStack: '',
      team: ''
    },
    contact: {
      email: '',
      phone: '',
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
        title={t('about.loadFailed')}
        description={error}
        type="error"
        showIcon
        style={{ margin: '20px' }}
      />
    );
  }

  const pageTitle = aboutData?.title || t('about.title');
  const companyName = aboutData?.company?.name ?? t('about.companyProfile');

  return (
    <div className="page tone-slate">
      <PageHeader
        eyebrow={t('nav.administration')}
        title={pageTitle}
        description={t('about.subtitle')}
        icon={<InfoCircleOutlined />}
      />

      <section className="page-card page-card--padded">
        <Row gutter={[32, 32]} align="middle">
          <Col xs={24} md={16}>
            <div style={{ marginBottom: 28 }}>
              {companyName !== pageTitle ? (
                <h3 className="page-card-title">{companyName}</h3>
              ) : null}
              <p style={{ margin: '8px 0 0', color: '#475467', fontSize: 16, lineHeight: 1.8 }}>
                {aboutData?.company?.description ?? t('about.defaultDescription')}
              </p>
            </div>

            <div style={{ marginBottom: 28 }}>
              <h3 className="page-card-title">{t('about.systemInfo')}</h3>
              <Row gutter={[16, 12]} style={{ marginTop: 12 }}>
                <Col xs={24} md={12}>
                  <Text strong>{t('about.systemVersion')}: </Text>
                  <Text>
                    {aboutData?.system?.version ?? ''}
                    <Text type="secondary"> ({__COMMIT_HASH__})</Text>
                  </Text>
                </Col>
                <Col xs={24} md={12}>
                  <Text strong>{t('about.releaseDate')}: </Text>
                  <Text>{aboutData?.system?.releaseDate ?? ''}</Text>
                </Col>
                <Col xs={24} md={12}>
                  <Text strong>{t('about.techStack')}: </Text>
                  <Text>{aboutData?.system?.techStack ?? ''}</Text>
                </Col>
                <Col xs={24} md={12}>
                  <Text strong>{t('about.development')}: </Text>
                  <Text>{aboutData?.system?.team ?? t('about.devTeam')}</Text>
                </Col>
              </Row>
            </div>

            <div>
              <h3 className="page-card-title">{t('about.contact')}</h3>
              <p style={{ margin: '8px 0 0', color: '#475467', fontSize: 16, lineHeight: 1.8 }}>
                <Text strong>{t('about.email')}: </Text>
                {aboutData?.contact?.email ?? ''}
                <br />
                <Text strong>{t('about.phone')}: </Text>
                {aboutData?.contact?.phone ?? ''}
                <br />
                <Text strong>{t('about.address')}: </Text>
                {aboutData?.contact?.address ?? t('about.defaultAddress')}
              </p>
            </div>
          </Col>

          <Col xs={24} md={8} style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                maxWidth: 320,
                margin: '0 auto',
                padding: 20,
                border: '1px solid var(--page-accent-border)',
                borderRadius: 12,
                background: 'var(--page-accent-tint)'
              }}
            >
              <Image
                src="/logo.svg"
                alt="Company Logo"
                preview={false}
                style={{ width: '100%', height: 'auto' }}
              />
              <h4 style={{ margin: '12px 0 0', fontWeight: 600 }}>
                {aboutData?.company?.name ?? t('about.systemName')}
              </h4>
              <p style={{ margin: '4px 0 0', color: '#475467' }}>
                {aboutData?.company?.slogan ?? t('about.systemSlogan')}
              </p>
            </div>
          </Col>
        </Row>
      </section>
    </div>
  );
}

export default About;
