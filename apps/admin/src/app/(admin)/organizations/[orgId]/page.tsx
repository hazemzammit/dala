import { OrgDetail } from './OrgDetail';

export default async function OrganizationDetailPage(props: { params: Promise<{ orgId: string }> }) {
  const params = await props.params;
  return <OrgDetail orgId={params.orgId} />;
}
