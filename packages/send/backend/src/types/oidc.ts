// Custom types for OIDC authentication
export interface OIDCUserInfo {
  sub: string;
  email?: string;
  username?: string;
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      oidcUser?: OIDCUserInfo;
    }
  }
}

export {};
