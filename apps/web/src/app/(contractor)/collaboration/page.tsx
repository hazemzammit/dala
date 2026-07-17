import { UsersThreeIcon } from '@phosphor-icons/react/ssr';

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
        icon={UsersThreeIcon}
        title="Aucune collaboration inter-entreprises"
        description="Les chantiers partagés avec d'autres entreprises apparaîtront ici."
      />
    </div>
  );
}
