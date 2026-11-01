import { z } from "zod";

export const maintenanceRequestSchema = z.object({
  propertyId: z.string().min(1),
  tenantId: z.string().min(1),
  requestId: z.string().min(1),
  summary: z.string().min(1),
  documentKey: z.string().min(1),
  inspectionDue: z.string().datetime(),
});

export type MaintenanceRequest = z.infer<typeof maintenanceRequestSchema>;

export function shouldScheduleInspection(request: MaintenanceRequest, today: Date): boolean {
  return new Date(request.inspectionDue).getTime() <= today.getTime();
}

export function roomName(request: MaintenanceRequest): string {
  return `property-${request.propertyId}-request-${request.requestId}`;
}
