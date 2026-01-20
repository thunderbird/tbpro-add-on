import { createPinia, setActivePinia, type Pinia } from 'pinia';

// Global reference to the shared Pinia instance
let piniaInstance: Pinia | null = null;

/**
 * Gets or creates the shared Pinia instance.
 * This ensures both background.ts and extension contexts use the same instance.
 */
export function getSharedPinia(): Pinia {
  if (!piniaInstance) {
    piniaInstance = createPinia();
    setActivePinia(piniaInstance);
  }
  return piniaInstance;
}

/**
 * Initializes the shared Pinia instance and sets it as active.
 * Call this once at the start of background.ts or extension entry point.
 */
export function initSharedPinia(): Pinia {
  const pinia = getSharedPinia();
  setActivePinia(pinia);
  return pinia;
}
