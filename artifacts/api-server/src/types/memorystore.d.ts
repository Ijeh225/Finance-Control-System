declare module "memorystore" {
  import session from "express-session";
  interface MemoryStoreOptions {
    checkPeriod?: number;
    max?: number;
    ttl?: number;
    dispose?: (key: string, value: unknown) => void;
    stale?: boolean;
    noDisposeOnSet?: boolean;
  }
  function MemoryStore(
    session: typeof import("express-session"),
  ): new (options?: MemoryStoreOptions) => session.Store;
  export = MemoryStore;
}
