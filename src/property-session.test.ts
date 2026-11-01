import assert from "node:assert/strict";
import { maintenanceRequestSchema, roomName, shouldScheduleInspection } from "./property-session.ts";

const request = maintenanceRequestSchema.parse({
  propertyId: "building-17", tenantId: "tenant-204", requestId: "repair-8841",
  summary: "Kitchen tap leaks", documentKey: "tenant-204/repair-8841.pdf", inspectionDue: "2026-10-20T09:00:00.000Z",
});

assert.equal(roomName(request), "property-building-17-request-repair-8841");
assert.equal(shouldScheduleInspection(request, new Date("2026-10-27T09:00:00.000Z")), true);
console.log("property session decision: inspection is scheduled for the overdue request");
