import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'prisma/'] },
  { files: ['**/*.{js,mjs,cjs,ts}'], languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'separate-type-imports' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }]
    }
  }
];
