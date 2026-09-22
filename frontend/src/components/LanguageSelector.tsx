import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalOutlined } from '@ant-design/icons';
import { Select, Space } from 'antd';
import type { SelectProps } from 'antd';

import type { LanguageSetting } from '@/i18n/languages';
import {
  SUPPORTED_LANGUAGES,
  applyLanguageSetting,
  languageFlag,
  languageLabelKey,
  readLanguageSetting
} from '@/i18n/languages';

interface LanguageSelectorProps {
  readonly minWidth?: number;
  readonly size?: 'large' | 'middle' | 'small';
}

function LanguageSelector({
  minWidth = 120,
  size = 'small'
}: LanguageSelectorProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [setting, setSetting] = useState<LanguageSetting>(() => readLanguageSetting());

  const selectOptions: SelectProps<LanguageSetting>['options'] = [
    {
      value: 'system',
      label: (
        <Space>
          <span>🌐</span>
          <span>{t('common.followSystem')}</span>
        </Space>
      )
    },
    ...SUPPORTED_LANGUAGES.map((language) => ({
      value: language,
      label: (
        <Space>
          <span>{languageFlag(language)}</span>
          <span>{t(languageLabelKey(language))}</span>
        </Space>
      )
    }))
  ];

  const handleLanguageChange = (next: LanguageSetting): void => {
    setSetting(next);
    applyLanguageSetting(next, i18n);
  };

  return (
    <Space>
      <GlobalOutlined style={{ color: '#666' }} />
      <Select<LanguageSetting>
        value={setting}
        onChange={handleLanguageChange}
        style={{ minWidth }}
        size={size}
        options={selectOptions}
      />
    </Space>
  );
}

export default LanguageSelector;
