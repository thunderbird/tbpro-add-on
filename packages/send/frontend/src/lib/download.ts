import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { ApiConnection } from '@send-frontend/lib/api';
import { getBlob } from '@send-frontend/lib/filesync';
import { Keychain } from '@send-frontend/lib/keychain';
import useMetricsStore from '@send-frontend/stores/metrics';

export default class Downloader {
  keychain: Keychain;
  api: ApiConnection;
  constructor(keychain: Keychain, api: ApiConnection) {
    this.keychain = keychain;
    this.api = api;
  }

  async doDownload(
    id: string,
    folderId: string,
    wrappedKeyStr: string,
    filename: string,
    metrics: ReturnType<typeof useMetricsStore>['metrics'],
    progressTracker: ProgressTracker
  ): Promise<boolean> {
    if (!id) {
      return false;
    }
    if (!folderId) {
      return false;
    }

    const wrappingKey = await this.keychain.get(folderId);

    if (!wrappingKey) {
      return false;
    }

    // Get necessary metadata
    const { size, type } = await this.api.call<{
      size: number;
      type: string;
    }>(`uploads/${id}/metadata`);
    if (!size) {
      return false;
    }

    const contentKey: CryptoKey =
      await this.keychain.container.unwrapContentKey(
        wrappedKeyStr,
        wrappingKey
      );

    const isBucketStorage = this.api.isBucketStorage;

    try {
      // Set the filename for progress tracking before starting download
      progressTracker.setFileName(filename);
      progressTracker.setProcessStage('downloading');

      await getBlob(
        id,
        size,
        contentKey,
        isBucketStorage,
        filename,
        type,
        this.api,
        progressTracker
      );

      metrics.capture('download.size', { size, type });
      return true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return false;
    }
  }
}
