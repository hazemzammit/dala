import { PendingApprovals } from './PendingApprovals';
import { QueryEditor } from './QueryEditor';

export default function DbExplorerPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Database Explorer</h1>
      <PendingApprovals />
      <QueryEditor />
    </div>
  );
}
