import { dbAll, dbExec, dbRun } from "@/lib/db";

export const PRIVACY_POLICY_VERSION = "2026-07-15";
export const PERSONAL_CONSENT_VERSION = "2026-07-15";

export type PrivacyRequestType = "access" | "correction" | "deletion" | "withdrawal";
export type PrivacyRequestStatus = "new" | "in_progress" | "completed" | "rejected";

export type PrivacyRequest = {
  id: number;
  user_id: number;
  type: PrivacyRequestType;
  details: string | null;
  status: PrivacyRequestStatus;
  admin_comment: string | null;
  created_at: string;
  updated_at: string;
};

let ready: Promise<void> | null = null;

export function ensurePrivacySchema() {
  if (!ready) {
    ready = dbExec(`
      CREATE TABLE IF NOT EXISTS consent_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        email TEXT,
        subject_ref TEXT,
        consent_type TEXT NOT NULL,
        document_version TEXT NOT NULL,
        source TEXT NOT NULL,
        granted INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_consent_events_user ON consent_events(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_consent_events_email ON consent_events(email, created_at);
      CREATE TABLE IF NOT EXISTS privacy_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        admin_comment TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_privacy_requests_user ON privacy_requests(user_id, created_at);
    `);
  }
  return ready;
}

export async function recordConsent(input: {
  userId?: number | null;
  email?: string | null;
  subjectRef?: string | null;
  type: "personal_data" | "marketing";
  version?: string;
  source: string;
  granted: boolean;
}) {
  await ensurePrivacySchema();
  await dbRun(
    `INSERT INTO consent_events (user_id, email, subject_ref, consent_type, document_version, source, granted)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.userId ?? null, input.email ?? null, input.subjectRef ?? null, input.type, input.version ?? PERSONAL_CONSENT_VERSION, input.source, input.granted ? 1 : 0],
  );
}

export async function listPrivacyRequests(userId: number) {
  await ensurePrivacySchema();
  return dbAll<PrivacyRequest>(`SELECT * FROM privacy_requests WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
}

export async function createPrivacyRequest(userId: number, type: PrivacyRequestType, details?: string) {
  await ensurePrivacySchema();
  await dbRun(`INSERT INTO privacy_requests (user_id, type, details) VALUES (?, ?, ?)`, [userId, type, details || null]);
}

export async function listAllPrivacyRequests() {
  await ensurePrivacySchema();
  return dbAll<PrivacyRequest & { email: string }>(
    `SELECT privacy_requests.*, users.email FROM privacy_requests JOIN users ON users.id = privacy_requests.user_id ORDER BY privacy_requests.created_at DESC`,
  );
}

export async function updatePrivacyRequest(id: number, status: PrivacyRequestStatus, comment?: string) {
  await ensurePrivacySchema();
  await dbRun(`UPDATE privacy_requests SET status = ?, admin_comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, comment || null, id]);
}
