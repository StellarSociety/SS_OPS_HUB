import { LeaveRequestsClient } from "@/components/hr/leave-requests-client";
import { listVenueLeaveRequests } from "@/lib/actions/hr-leave-requests";

export default async function LeaveRequestsPage() {
  const data = await listVenueLeaveRequests();

  return (
    <LeaveRequestsClient
      requests={data.requests}
      leaveTypes={data.leaveTypes}
      canManage={data.canManage}
      error={data.error}
    />
  );
}
