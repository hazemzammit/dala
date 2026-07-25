/**
 * Classifies a SQL statement submitted to the Database Explorer (Doc 04
 * §4.3.5). Deliberately conservative — the spec only authorizes SELECT
 * (default, no confirmation) and INSERT/UPDATE/DELETE (danger-zone
 * confirmation + reason + possible second-admin approval). DDL and
 * anything else (DROP, TRUNCATE, ALTER, GRANT, CREATE, COPY, VACUUM,
 * pg_terminate_backend, etc.) is blocked outright, in both paths — the
 * spec never authorizes schema changes or admin-level Postgres functions
 * from this screen, and allowing them would be a much bigger blast radius
 * than "two admins agreed to fix one row."
 *
 * Also rejects multi-statement input (anything with a semicolon other
 * than one optional trailing one) — a query box that can chain statements
 * is a query box that can smuggle a second, unreviewed statement past the
 * approval flow.
 */
const FORBIDDEN_KEYWORDS =
  /\b(drop|truncate|alter|grant|revoke|create|copy|vacuum|reindex|refresh\s+materialized|pg_terminate_backend|pg_cancel_backend|do\s+\$\$|call)\b/i;

export type SqlKind = 'read' | 'write' | 'forbidden';

export function classifySql(rawSql: string): { kind: SqlKind; reason?: string } {
  const sql = rawSql.trim();

  if (!sql) return { kind: 'forbidden', reason: 'Requête vide.' };

  const withoutTrailingSemicolon = sql.endsWith(';') ? sql.slice(0, -1) : sql;
  if (withoutTrailingSemicolon.includes(';')) {
    return {
      kind: 'forbidden',
      reason: "Une seule instruction SQL à la fois (pas de ';' interne).",
    };
  }

  if (FORBIDDEN_KEYWORDS.test(sql)) {
    return {
      kind: 'forbidden',
      reason:
        "Instructions de modification de schéma ou d'administration Postgres non autorisées depuis cet écran.",
    };
  }

  const firstWord = withoutTrailingSemicolon.trim().split(/\s+/)[0]?.toLowerCase();

  if (firstWord === 'select' || firstWord === 'with' || firstWord === 'explain') {
    return { kind: 'read' };
  }
  if (firstWord === 'insert' || firstWord === 'update' || firstWord === 'delete') {
    return { kind: 'write' };
  }

  return { kind: 'forbidden', reason: 'Type de requête non reconnu ou non autorisé.' };
}
