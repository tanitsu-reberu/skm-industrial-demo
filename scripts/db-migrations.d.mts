export function applyMigrations(client: { query(sql: string, args?: unknown[]): Promise<unknown> }, options?: { inTransaction?: boolean; sourceUTCVerified?: boolean; through?: string }): Promise<void>;
export function migrationInventory(): Promise<Array<{ version: string; sql: string; checksum: string }>>;
export function setTransactionTimeouts(client: { query(sql: string, args?: unknown[]): Promise<unknown> }): Promise<void>;
