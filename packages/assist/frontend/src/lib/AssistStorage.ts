import { logger } from '@thunderbirdops/services-utils';

// Class for managing stored values for rest of application
export class AssistStorage {
  private storage: Storage;
  // Using the type defined by Web Storage API
  // https://developer.mozilla.org/en-US/docs/Web/API/Storage
  constructor(storage: Storage) {
    this.storage = storage;
  }

  removeFromStorage(key: string) {
    try {
      this.storage.removeItem(key);
    } catch (error) {
      logger.error(`Error removing key ${key} from storage: ${error}`);
    }
  }

  loadFromStorage(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch (error) {
      logger.error(`Error loading key ${key} from storage: ${error}`);
      return null;
    }
  }

  saveToStorage(key: string, value: string) {
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      logger.error(`Error saving key ${key} to storage: ${error}`);
    }
  }
}
