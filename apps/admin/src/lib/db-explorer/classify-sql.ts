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

/**
 * Functions with no place in a support/debug SQL box: they read server files,
 * execute SQL passed as a string (which would smuggle any statement past the
 * classifier), sleep, take advisory locks, mutate sequences/settings, or
 * touch replication. This is a speed bump, NOT a security boundary — the real
 * guarantee for the read path is the READ ONLY transaction in
 * read-only-query.ts. Matched against the raw text (literals included) on
 * purpose: query_to_xml('select ...') hides its payload inside a literal.
 */
const FORBIDDEN_FUNCTIONS =
  /\b(pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_file|lo_\w+|dblink\w*|query_to_xml\w*|table_to_xml\w*|cursor_to_xml\w*|schema_to_xml\w*|database_to_xml\w*|set_config|pg_sleep\w*|pg_advisory\w*|nextval|setval|pg_reload_conf|pg_rotate_logfile|pg_switch_wal|pg_promote|pg_replication\w*|pg_create_\w+|pg_drop_\w+|pg_logical\w*)\b/i;

/**
 * Replaces string literals (incl. dollar-quoted), quoted identifiers and
 * comments with spaces so keyword scans only see real SQL tokens
 * (`where action = 'delete'` must not look like a DELETE).
 */
export function stripLiteralsAndComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      out += ' ';
    } else if (two === '/*') {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      out += ' ';
    } else if (c === "'" || c === '"') {
      i++;
      while (i < sql.length) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) i += 2; // doubled quote = escaped quote
          else { i++; break; }
        } else i++;
      }
      out += ' ';
    } else if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? sql.length : end + tag.length;
        out += ' ';
      } else { out += c; i++; }
    } else { out += c; i++; }
  }
  return out;
}

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

  if (FORBIDDEN_FUNCTIONS.test(sql)) {
    return {
      kind: 'forbidden',
      reason:
        'Fonction non autorisée depuis cet écran (lecture de fichiers, SQL dynamique, verrous ou état serveur).',
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
    // A statement that STARTS like a read can still write: a data-modifying
    // CTE (`with d as (delete ... returning *) select ...`) or
    // `explain analyze delete ...` (EXPLAIN ANALYZE executes its target).
    // Those belong in the danger-zone path (reason + approval), not /query.
    const tokens = stripLiteralsAndComments(withoutTrailingSemicolon);
    if (/\b(insert|update|delete|merge)\b/i.test(tokens)) return { kind: 'write' };
    if (/\binto\b/i.test(tokens)) {
      return { kind: 'forbidden', reason: 'SELECT ... INTO non autorisé depuis cet écran.' };
    }
    return { kind: 'read' };
  }
  if (firstWord === 'insert' || firstWord === 'update' || firstWord === 'delete') {
    return { kind: 'write' };
  }

  return { kind: 'forbidden', reason: 'Type de requête non reconnu ou non autorisé.' };
}

/**
 * Schemas/relations that hold secrets or credentials: the Vault (RIB and TOTP
 * encryption keys), Supabase Auth (password hashes, MFA secrets, refresh
 * tokens) and the admin console's own credential tables. Checked ONLY on the
 * read path (/query, open to every admin role); the super-admin danger-zone
 * path is governed by reason + approval instead. Raw-text match incl. quoted
 * identifiers and literals, so `"vault"."decrypted_secrets"` is caught too.
 * Best-effort: the durable fix is a restricted DB login role for this path.
 */
const SENSITIVE_REFERENCES =
  /\b(vault|auth|pg_authid|pg_shadow|pg_user_mappings|decrypted_secrets|encrypted_password|platform_admins|admin_sessions|mfa_recovery_codes)\b/i;

export function findSensitiveReference(rawSql: string): string | null {
  const normalised = rawSql.replace(/"/g, '');
  const m = SENSITIVE_REFERENCES.exec(normalised);
  return m ? m[1]!.toLowerCase() : null;
}
