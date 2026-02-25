import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {any} */
const config = [
  {
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser',
      },
      globals: {
        ...globals.browser, // Existing browser globals
        ...globals.webextensions, // Existing browser globals
        __dirname: 'readonly', // Setting __dirname as a global variable
        __filename: 'readonly', // Commonly used alongside __dirname
        process: 'readonly', // Another common Node.js global
        require: 'readonly', // If using CommonJS modules
        __APP_VERSION__: 'readonly', // Project version
        __APP_NAME__: 'readonly', // Project name
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-extra-boolean-cast': 'off',
      'preserve-caught-error': 'off',
      'vue/no-use-v-if-with-v-for': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['public/api/**/*.js'],
    languageOptions: {
      globals: {
        Cr: true,
        Ci: true,
        Cu: true,
        Cc: true,
        Components: true,
        ChromeUtils: true,
        Services: true,
        console: true,
        fetch: true,
        atob: true,
        URL: true,
        URLSearchParams: true,
        ExtensionCommon: true,
      },
    },
  },
];

export default config;
