import { OrganizationsTable } from './OrganizationsTable';

export default function OrganizationsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Organisations</h1>
      <div className="mt-6">
        <OrganizationsTable />
      </div>
    </div>
  );
}
