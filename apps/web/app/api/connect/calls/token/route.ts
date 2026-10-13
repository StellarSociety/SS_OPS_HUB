import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadConnectPeople } from "@/lib/connect/store";

export const runtime = "nodejs";

type TokenRequest = { callId?: unknown };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  let input: TokenRequest;
  try {
    input = (await request.json()) as TokenRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const callId = typeof input.callId === "string" ? input.callId : "";
  if (!/^[0-9a-f-]{36}$/i.test(callId)) {
    return Response.json({ error: "Invalid call." }, { status: 400 });
  }

  const livekitUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!livekitUrl || !apiKey || !apiSecret) {
    return Response.json({ error: "Calling isn't configured on this deployment." }, { status: 503 });
  }

  const service = createServiceClient();
  const { data: call } = await service
    .from("chat_calls")
    .select("id, conversation_id, initiated_by, status, expires_at, livekit_room")
    .eq("id", callId)
    .maybeSingle();
  if (!call || !["ringing", "active"].includes(call.status as string)) {
    return Response.json({ error: "This call is no longer available." }, { status: 404 });
  }
  if (
    call.status === "ringing" &&
    call.initiated_by !== user.id
  ) {
    return Response.json({ error: "Accept the call before joining." }, { status: 409 });
  }
  if (call.status === "ringing" && new Date(call.expires_at as string).getTime() <= Date.now()) {
    return Response.json({ error: "This call has expired." }, { status: 410 });
  }

  const [{ data: member }, { data: participant }, people] = await Promise.all([
    service
      .from("chat_members")
      .select("user_id")
      .eq("conversation_id", call.conversation_id as string)
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("chat_call_participants")
      .select("user_id")
      .eq("call_id", callId)
      .eq("user_id", user.id)
      .maybeSingle(),
    loadConnectPeople(service, [user.id]),
  ]);
  if (!member || !participant) {
    return Response.json({ error: "You aren't a participant in this call." }, { status: 403 });
  }

  const person = people.get(user.id);
  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: person?.name ?? user.email ?? "Ops Hub user",
    ttl: "10m",
    metadata: JSON.stringify({ callId, conversationId: call.conversation_id }),
  });
  token.addGrant({
    room: call.livekit_room as string,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return Response.json({
    token: await token.toJwt(),
    serverUrl: livekitUrl,
  });
}
