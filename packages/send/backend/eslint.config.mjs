import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
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
];
