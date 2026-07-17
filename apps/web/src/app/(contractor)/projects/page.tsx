import { BuildingsIcon } from '@phosphor-icons/react/ssr';

import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Placeholder — full screen spec in
 * docs/spec/04-screens-web-contractor-and-admin.md. Icon imported from the
 * /ssr submodule since this is a Server Component (Doc: phosphor-icons
 * README "React Server Components and SSR" — the default export relies on
 * React Context, which RSC does not support).
 */
export default function Page() {
  return (
    <div className="p-8">
      <EmptyState
        icon={BuildingsIcon}
        title="Aucun chantier pour le moment"
        description="Créez votre premier chantier pour commencer à suivre budget, équipe et avancement."
      />
    </div>
  );
}
