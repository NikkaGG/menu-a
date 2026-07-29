import { vi } from "vitest";

export function createMockResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers);
  const isBlob = body instanceof Blob;
  if (!isBlob && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: vi.fn(async () => {
      if (isBlob) throw new SyntaxError("Not JSON");
      return body;
    }),
    blob: vi.fn(async () => (isBlob ? body : new Blob([JSON.stringify(body)]))),
  } as unknown as Response;
}

export function installFetchMock(fetchMock: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal("fetch", fetchMock);
}
