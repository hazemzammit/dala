import { AdminUsersTable } from './AdminUsersTable';

export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Gestion des admins</h1>
      <div className="mt-6">
        <AdminUsersTable />
      </div>
    </div>
  );
}
