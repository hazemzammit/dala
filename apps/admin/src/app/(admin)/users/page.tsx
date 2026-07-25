import { UsersTable } from './UsersTable';

export default function UsersPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Utilisateurs</h1>
      <div className="mt-6">
        <UsersTable />
      </div>
    </div>
  );
}
