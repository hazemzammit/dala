import { OrgDetail } from './OrgDetail';

export default function OrganizationDetailPage({ params }: { params: { orgId: string } }) {
  return <OrgDetail orgId={params.orgId} />;
}
