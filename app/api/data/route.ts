import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { validCommand, type Answer, type Data } from "@/lib/data";

export const runtime = "nodejs";

function connection(request: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const password = process.env.TEAM_ACCESS_PASSWORD;
  if (!url || !key || !password) {
    return Response.json({ error: "Supabaseの接続設定が未完了です。管理者に連絡してください。" }, { status: 503 });
  }
  const provided = request.headers.get("x-team-password") ?? "";
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(hash(provided), hash(password))) {
    return Response.json({ error: "合言葉が違います。" }, { status: 401 });
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const failure = () => Response.json({ error: "データベースに接続できませんでした。接続設定を確認して、再度お試しください。" }, { status: 502 });

export async function GET(request: Request) {
  try {
    const db = connection(request);
    if (db instanceof Response) return db;
    // One SQL statement returns a consistent snapshot, including empty lists.
    const { data, error } = await db.rpc("get_futsal_data");
    if (error) return failure();
    return Response.json(data as Data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure();
  }
}

export async function POST(request: Request) {
  try {
    const db = connection(request);
    if (db instanceof Response) return db;
    let command: unknown;
    try { command = await request.json(); } catch {
      return Response.json({ error: "入力内容が不正です。" }, { status: 400 });
    }
    if (!validCommand(command)) return Response.json({ error: "入力内容が不正です。" }, { status: 400 });
    let result;
    switch (command.type) {
      case "add-event":
        result = await db.from("events").insert({ id: command.id, date: command.date }).select("id");
        break;
      case "save-member":
        result = command.editing
          ? await db.from("members").update({ name: command.name.trim() }).eq("id", command.id).select("id")
          : await db.from("members").insert({ id: command.id, name: command.name.trim() }).select("id");
        break;
      case "save-answer": {
        const a: Answer = command.answer;
        result = await db.from("answers").upsert({ event_id: command.eventId, member_id: command.memberId, status: a.status, include_self: a.includeSelf, guests: a.guests, note: a.note, updated_at: new Date().toISOString() }, { onConflict: "event_id,member_id" }).select("event_id");
        break;
      }
      case "delete-event":
        result = await db.from("events").delete().eq("id", command.id).eq("date", command.date).select("id");
        break;
      case "delete-member":
        result = await db.from("members").delete().eq("id", command.id).select("id");
        break;
    }
    if (result.error) return failure();
    if (!result.data?.length) return Response.json({ error: "対象データが変更・削除されています。再読み込みしてください。" }, { status: 409 });
    return Response.json({ ok: true });
  } catch {
    return failure();
  }
}
