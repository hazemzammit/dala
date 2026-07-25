import { AuditLogTable } from './AuditLogTable';

export default function AuditLogPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Journal d'audit</h1>
      <div className="mt-6">
        <AuditLogTable />
      </div>
    </div>
  );
}
