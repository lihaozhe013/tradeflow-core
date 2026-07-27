declare global {
  namespace Express {
    interface Request {
      user?: {
        username: string;
        /** Role: 'reader' | 'editor' | 'superuser' */
        role: string;
        name: string;
        pwd_ver: string;
      };
    }
  }
}
export interface User {
  username: string;
  /** Role: 'reader' | 'editor' | 'superuser' */
  role: string;
  name: string;
  pwd_ver: string;
}

export interface CustomError extends Error {
  stack?: string;
}

export {};
