import fs from 'fs';
import path from 'path';
import { UserConfig, Plugin } from 'vite';

export const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf8')
);

export const removeEmptySourcemapsPlugin = (): Plugin => ({
  name: 'remove-empty-sourcemaps',
  generateBundle(options, bundle) {
    for (const fileName in bundle) {
      const chunk = bundle[fileName];
      if (chunk.type === 'chunk' && chunk.map) {
        if (!chunk.map.sources || chunk.map.sources.length === 0) {
          chunk.map = null;
          delete bundle[`${fileName}.map`];
          chunk.code = chunk.code.replace(/\/\/# sourceMappingURL=.*\n?/, '');
        }
      }
    }
  },
});

export const sharedViteConfig: UserConfig = {
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_NAME__: JSON.stringify(packageJson.name),
  },
};
