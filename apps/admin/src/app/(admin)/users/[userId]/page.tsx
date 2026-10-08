import { UserDetail } from './UserDetail';

/**
 * Doc 04 §4.3.4, admin remediation Tier 4.8. Checked before building this
 * — apps/admin had no user-detail view of any kind (UsersTable.tsx was
 * list-only). Per the plan's own explicit scope cut, this is a minimal
 * notes-only view, not a full user-detail page built out for its own
 * sake — everything else about a user (org membership, suspension state,
 * etc.) is still only on the Users list screen.
 */
export default async function UserDetailPage(props: { params: Promise<{ userId: string }> }) {
 const params = await props.params;
 return <UserDetail userId={params.userId} />;
}
