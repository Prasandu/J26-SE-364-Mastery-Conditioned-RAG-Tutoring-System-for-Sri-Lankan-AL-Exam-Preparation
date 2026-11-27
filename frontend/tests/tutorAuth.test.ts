import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SEC-007a: the support service now rejects unauthenticated tutor/voice calls, so
// every client call must carry the shared Supabase access token.
vi.mock("@/auth/supabase", () => ({ readAccessToken: async () => "test-access-token" }));

import { askTutor } from "../src/features/tutor/services/tutorApi";
import { synthesizeSinhalaSpeech, transcribeAudio } from "../src/features/tutor/services/voiceApi";

describe("tutor and voice clients send the signed-in user's token", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function authorizationOfLastCall(): string | null {
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    return new Headers(init.headers).get("Authorization");
  }

  it("askTutor", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ answer: "a", citations: [], grounded: true }), { status: 200 }),
    );

    await askTutor("What is a mole?", "en");

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/tutor\/ask$/);
    expect(authorizationOfLastCall()).toBe("Bearer test-access-token");
  });

  it("transcribeAudio", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: "hi" }), { status: 200 }));

    await transcribeAudio(new Blob(["x"]), "en");

    expect(authorizationOfLastCall()).toBe("Bearer test-access-token");
  });

  it("synthesizeSinhalaSpeech", async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(["RIFF"]), { status: 200 }));

    await synthesizeSinhalaSpeech("මවුලය");

    expect(authorizationOfLastCall()).toBe("Bearer test-access-token");
  });

  it("surfaces a 401 as an error instead of a silent empty answer", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(askTutor("x", "en")).rejects.toThrow("401");
  });
});
