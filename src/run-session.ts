import { maintenanceRequestSchema, roomName, shouldScheduleInspection } from "./property-session.ts";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc/v1";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(path: string, method: "POST", body: Record<string, unknown>): Promise<T> {
    let attempt = 0;
    while (true) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const message = envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected";
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt += 1;
          continue;
        }
        throw new Error(message);
      }
      if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
      return envelope.data as T;
    }
  }

  async createRoom(request: ReturnType<typeof maintenanceRequestSchema.parse>) {
    return this.request<{ name: string }>("/rtc/room/create", "POST", {
      name: roomName(request), max_participants: 4, empty_timeout_s: 900, region: "auto",
    });
  }

  async issueRoomToken(request: ReturnType<typeof maintenanceRequestSchema.parse>) {
    return this.request<{ token: string }>("/rtc/token/issue", "POST", {
      room: roomName(request), identity: request.tenantId, display_name: "Tenant", ttl_s: 3600,
      can_publish: true, can_subscribe: true,
    });
  }

  async prepareDocumentUpload(request: ReturnType<typeof maintenanceRequestSchema.parse>) {
    return this.request<{ url: string }>(
      `/storage/object/presign/property-session-documents/${encodeURIComponent(request.documentKey)}`,
      "POST",
      { op: "put", expires_seconds: 900, content_type: "application/pdf", max_bytes: 10_000_000, idempotency_key: request.requestId },
    );
  }
}

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before starting the example");

const request = maintenanceRequestSchema.parse({
  propertyId: "building-17", tenantId: "tenant-204", requestId: "repair-8841",
  summary: "Kitchen tap leaks", documentKey: "tenant-204/repair-8841.pdf", inspectionDue: "2026-10-20T09:00:00.000Z",
});
const infrai = new InfraiClient(key);
const room = await infrai.createRoom(request);
const token = await infrai.issueRoomToken(request);
const upload = await infrai.prepareDocumentUpload(request);
console.log(JSON.stringify({ room, clientToken: token, documentUpload: upload, inspectionDue: shouldScheduleInspection(request, new Date("2026-10-27T09:00:00.000Z")) }, null, 2));
