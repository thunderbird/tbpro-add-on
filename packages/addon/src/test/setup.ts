// Test setup file for addon tests

// Mock the TRPC client to avoid network calls during testing
vi.mock('send-frontend/src/lib/trpc', () => ({
  trpc: {
    // Mock any TRPC methods that might be called
    getLoginStatus: {
      query: vi.fn().mockResolvedValue({ isLoggedIn: false }),
    },
    getDefaultFolder: {
      query: vi.fn().mockResolvedValue({ id: 'default-folder-id' }),
    },
    // Add other methods as needed
  },
}));

// Mock logger to avoid console output during tests
vi.mock('send-frontend/src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('tbpro-shared', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_TESTING: 'true',
    VITE_SEND_SERVER_URL: 'http://localhost:3000',
  },
  writable: true,
});

// Mock fetch to prevent actual network calls
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({}),
});
