import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    // `.docker-build` is a generated, gitignored copy of the backend source
    // created while preparing the Docker build context. It must never be
    // linted, otherwise ESLint sees two copies of the source tree and fails
    // with "multiple candidate TSConfigRootDirs are present".
    ignores: ['.docker-build/**', 'dist/**'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser, // Existing browser globals
        __dirname: 'readonly', // Setting __dirname as a global variable
        __filename: 'readonly', // Commonly used alongside __dirname
        process: 'readonly', // Another common Node.js global
        require: 'readonly', // If using CommonJS modules
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-extra-boolean-cast': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
