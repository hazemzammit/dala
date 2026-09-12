import { PageHero } from '@dala/ui-web';
import { BuildingsIcon } from '@phosphor-icons/react/ssr';

import { OrganizationsTable } from './OrganizationsTable';

export default function OrganizationsPage() {
  return (
    <div>
      <PageHero
        icon={BuildingsIcon}
        title="Organisations"
        description="Gérez les comptes contractants : plans, membres, statut et vérification."
      />
      <div className="mt-6">
        <OrganizationsTable />
      </div>
    </div>
  );
}
