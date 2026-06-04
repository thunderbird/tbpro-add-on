import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPlugin from 'eslint-plugin-eslint-plugin';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import mozillaPlugin from 'eslint-plugin-mozilla';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import tsParser from '@typescript-eslint/parser';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = ['src/**/*.{ts,tsx,vue,js}', 'public/api/**/*.js'];
const tsVueFiles = ['src/**/*.{ts,tsx,vue}'];
const jsFiles = ['src/**/*.js', 'public/api/**/*.js'];
const publicApiFiles = ['public/api/**/*.js'];

/** @type {any} */
const config = [
  {
    ignores: [
      'build/**',
      'coverage/**',
      'dist/**',
      'dist-*/**',
      'node_modules/**',
    ],
  },
  {
    files: tsVueFiles,
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        tsconfigRootDir: __dirname,
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
  {
    files: jsFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        __APP_VERSION__: 'readonly',
        __APP_NAME__: 'readonly',
      },
    },
  },
  pluginJs.configs.recommended,
  ...mozillaPlugin.configs['flat/recommended'],
  {
    files: ['src/**/*.js'],
    rules: {
      'mozilla/import-globals': 'off',
    },
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    ...eslintPlugin.configs.recommended,
    files: sourceFiles,
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 16,
      },
    },
  },
  eslintConfigPrettier,
  {
    files: sourceFiles,
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      camelcase: ['error', { properties: 'never' }],
      'handle-callback-err': ['error', 'er'],
      'jsdoc/check-param-names': 'error',
      'no-extra-boolean-cast': 'off',
      'no-lonely-if': 'error',
      'no-undef-init': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-const': 'error',
      'preserve-caught-error': 'off',
      strict: ['error', 'global'],
      'vue/no-use-v-if-with-v-for': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['eslint-plugin-mozilla/lib/configs/**/*.js'],
    rules: {
      'sort-keys': 'error',
    },
  },
  {
    files: publicApiFiles,
    languageOptions: {
      sourceType: 'script',
      globals: {
        Cr: 'readonly',
        Ci: 'readonly',
        Cu: 'readonly',
        Cc: 'readonly',
        Components: 'readonly',
        ChromeUtils: 'readonly',
        Services: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        atob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        ExtensionCommon: 'readonly',
      },
    },
  },
];

export default config;
