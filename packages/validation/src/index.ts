/**
 * @dala/validation
 *
 * Single shared Zod schema package (Doc 00 §0.7 / Doc 01 §1.1) imported by
 * mobile, web, and edge functions. This is the concrete mechanism that keeps
 * the two clients from drifting on what counts as a valid input — a rule
 * changed here takes effect everywhere the moment the package is rebuilt,
 * rather than being reimplemented three times and slowly diverging.
 *
 * Convention: one file per feature area, re-exported here. When adding a new
 * screen's form, check whether a schema already exists before writing one —
 * duplicated near-identical schemas are exactly the drift this package
 * exists to prevent.
 */

export * from './auth';
export * from './organizations';
export * from './projects';
export * from './projectWorkers';
export * from './dispatch';
export * from './money';
export * from './fieldOps';
export * from './collaboration';
export * from './notifications';
export * from './exports';
export * from './mfa';
export * from './feedback';
