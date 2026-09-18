"use client";

import Link from "next/link";
import type { Answer, Command, Data, Event, Member, Status } from "@/lib/data";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

function StatusMark({ status }: { status: Status }) {
  if (status === "未回答") return null;
  return (
    <svg
      className="status-mark"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {status === "出席" ? (
        <circle cx="12" cy="12" r="8" />
      ) : (
        <path d="m4 4 16 16M20 4 4 20" />
      )}
    </svg>
  );
}
const emptyAnswer = (): Answer => ({
  status: "未回答",
  includeSelf: true,
  guests: [],
  note: "",
  updatedAt: "",
});
const initialData: Data = { members: [], events: [] };
const uid = () => crypto.randomUUID();
const dateParts = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  return {
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: ["日", "月", "火", "水", "木", "金", "土"][d.getDay()],
  };
};
const attendanceCount = (answer: Answer) =>
  Number(answer.status === "出席" && answer.includeSelf) + answer.guests.length;
const total = (event: Event, members: Member[]) =>
  members.reduce(
    (n, m) =>
      n + (event.answers[m.id] ? attendanceCount(event.answers[m.id]) : 0),
    0,
  );
const openingEventId = (events: Event[], today: string) => {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  return (sorted.find((e) => e.date >= today) ?? sorted.at(-1))?.id ?? "";
};
const updated = (value: string) =>
  value
    ? new Date(value).toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "まだ回答していません";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87" />
        <circle cx="9" cy="7" r="4" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    edit: (
      <>
        <path d="m16 3 5 5-12 12-6 1 1-6Z" />
        <path d="m14 5 5 5" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7" />,
    ball: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m12 7 5 4-2 6H9l-2-6ZM12 7V2M17 11l5-2M15 17l3 4M9 17l-3 4M7 11 2 9" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.calendar}
    </svg>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="閉じる">
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function CalendarPicker({
  events,
  members,
  selected,
  onSelect,
  onClose,
}: {
  events: Event[];
  members: Member[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const current = events.find((e) => e.id === selected);
  const [month, setMonth] = useState(
    (current?.date ?? new Date().toLocaleDateString("sv-SE")).slice(0, 7),
  );
  const [dayChoices, setDayChoices] = useState<Event[]>([]);
  const [year, monthNumber] = month.split("-").map(Number);
  const offset = new Date(year, monthNumber - 1, 1).getDay();
  const days = new Date(year, monthNumber, 0).getDate();
  const moveMonth = (direction: number) => {
    const date = new Date(year, monthNumber - 1 + direction, 1);
    setMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
    setDayChoices([]);
  };
  return (
    <Modal title="開催日を選択" onClose={onClose}>
      <div className="calendar-month">
        <button
          className="icon-button previous-month"
          aria-label="前の月"
          onClick={() => moveMonth(-1)}
        >
          <Icon name="arrow" />
        </button>
        <input
          type="month"
          aria-label="表示する月"
          value={month}
          onChange={(e) => {
            if (e.target.value) {
              setMonth(e.target.value);
              setDayChoices([]);
            }
          }}
        />
        <button
          className="icon-button"
          aria-label="次の月"
          onClick={() => moveMonth(1)}
        >
          <Icon name="arrow" />
        </button>
      </div>
      <div className="calendar-grid">
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
          <span className="calendar-weekday" key={day}>
            {day}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const day = i - offset + 1;
          if (day < 1 || day > days)
            return <span className="calendar-blank" key={i} />;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const matches = events.filter((e) => e.date === date);
          return (
            <button
              key={i}
              disabled={!matches.length}
              className={`calendar-day ${matches.some((e) => e.id === selected) ? "selected" : ""}`}
              aria-label={`${year}年${monthNumber}月${day}日${matches.length ? "の開催日" : " 開催なし"}`}
              aria-pressed={matches.some((e) => e.id === selected)}
              onClick={() => {
                if (matches.length === 1) onSelect(matches[0].id);
                else setDayChoices(matches);
              }}
            >
              <span>{day}</span>
              {!!matches.length && <i />}
            </button>
          );
        })}
      </div>
      {!events.some((e) => e.date.startsWith(month)) && (
        <p className="calendar-empty">この月の開催日はありません。</p>
      )}
      {!!dayChoices.length && (
        <div className="calendar-choices">
          {dayChoices.map((e, i) => (
            <button
              className="button secondary"
              key={e.id}
              onClick={() => onSelect(e.id)}
            >
              {e.date.replaceAll("-", "/")} · {i + 1} · {total(e, members)}人
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function Home() {
  const [data, setData] = useState<Data>(initialData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const requestVersion = useRef(0);
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState<"すべて" | Status>("すべて");
  const [modal, setModal] = useState<
    "event" | "member" | "answer" | "calendar" | null
  >(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [answer, setAnswer] = useState<Answer>(emptyAnswer());
  const [memberName, setMemberName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteDate, setDeleteDate] = useState("");
  const [confirmation, setConfirmation] = useState<{
    kind: "event" | "member";
    id: string;
    name: string;
    date?: string;
  } | null>(null);
  const requestData = useCallback(async (command?: Command): Promise<Data | { ok: true }> => {
    const response = await fetch("/api/data", {
      method: command ? "POST" : "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "x-team-password": password },
      ...(command ? { body: JSON.stringify(command) } : {}),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "通信に失敗しました。");
    return body;
  }, [password]);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    const restored = await requestData() as Data;
    if (version !== requestVersion.current) return;
    setData(restored);
    setSelected(current => restored.events.some(e => e.id === current)
      ? current : openingEventId(restored.events, new Date().toLocaleDateString("sv-SE")));
    setError("");
  }, [requestData]);
  const save = async (command: Command) => {
    if (saving.current) return false;
    saving.current = true;
    ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      await requestData(command);
      try { await load(); } catch {
        setError("保存は完了しましたが、最新データを取得できませんでした。再読み込みしてください。");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信に失敗しました。再度お試しください。");
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!ready) return;
    const refresh = () => {
      if (saving.current || document.hidden) return;
      void load().catch(() => setError("最新データを取得できませんでした。通信状況を確認してください。"));
    };
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [ready, load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const event = data.events.find((e) => e.id === selected);
  const today = new Date().toLocaleDateString("sv-SE");
  const sortedEvents = [...data.events].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const eventIndex = sortedEvents.findIndex((e) => e.id === selected);
  const chooseEvent = (id: string) => {
    setSelected(id);
    setFilter("すべて");
  };
  const lastUpdate = event
    ? Object.values(event.answers)
        .map((a) => a.updatedAt)
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        .at(-1)
    : undefined;
  const close = () => {
    setModal(null);
    setGuestName("");
  };
  const addGuest = () => {
    if (!guestName.trim()) return;
    setAnswer({ ...answer, guests: [...answer.guests, guestName.trim()] });
    setGuestName("");
  };
  const openAnswer = (member: Member) => {
    setEditing(member);
    setAnswer(
      event?.answers[member.id]
        ? {
            ...event.answers[member.id],
          }
        : emptyAnswer(),
    );
    setModal("answer");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="FUTSAL NOTE ホーム">
          <span className="brand-icon">
            <Icon name="ball" size={25} />
          </span>
          <span>
            FUTSAL<span className="brand-light"> NOTE</span>
          </span>
        </Link>
      </header>
      <div className="main-shell">
        <main>
          <div className="page-heading compact-heading">
            <div className="event-switcher">
              <button
                className="icon-button previous-month"
                disabled={!ready || busy || eventIndex <= 0}
                aria-label="前の開催日"
                onClick={() => chooseEvent(sortedEvents[eventIndex - 1].id)}
              >
                <Icon name="arrow" size={17} />
              </button>
              <button
                className="date-picker-button"
                disabled={!ready || busy}
                aria-label="開催日を選択"
                aria-haspopup="dialog"
                onClick={() => setModal("calendar")}
              >
                <span className="current-date">
                  <small>
                    {event ? `${event.date.slice(0, 4)}年 · 開催日` : "開催日"}
                  </small>
                  <strong>
                    {event
                      ? `${dateParts(event.date).month}月${dateParts(event.date).day}日（${dateParts(event.date).weekday}）`
                      : "日付を選択"}
                  </strong>
                </span>
                <Icon name="calendar" size={18} />
              </button>
              <button
                className="icon-button"
                disabled={
                  !ready || busy ||
                  eventIndex < 0 ||
                  eventIndex >= sortedEvents.length - 1
                }
                aria-label="次の開催日"
                onClick={() => chooseEvent(sortedEvents[eventIndex + 1].id)}
              >
                <Icon name="arrow" size={17} />
              </button>
            </div>
            <button
              className="button primary add-event"
              disabled={!ready || busy}
              aria-label="開催日を追加"
              title="開催日を追加"
              onClick={() => {
                setEditing(null);
                setMemberName("");
                setModal("event");
              }}
            >
              <Icon name="plus" size={20} />
            </button>
          </div>
          {!ready && (
            <form className="roster-panel" onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                await load();
                setReady(true);
              } catch (e) {
                setError(e instanceof Error ? e.message : "通信に失敗しました。");
              } finally { setBusy(false); }
            }}>
              <label className="field">
                チームの合言葉
                <input type="password" required disabled={busy} autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? "接続中…" : "出欠表を開く"}
              </button>
            </form>
          )}
          {error && <div className="info-banner" role="alert">{error}</div>}
          {busy && ready && <div className="info-banner" role="status">保存中…</div>}
          <fieldset className="attendance-controls" hidden={!ready} disabled={!ready || busy}>
          {event ? (
            <section className="attendance-section">
              <div className="members-panel">
                <div className="members-heading">
                  <div className="member-heading-top">
                    <div>
                      <h2 className="attendance-summary">
                        <span className="attendance-label">
                          <Icon name="ball" size={22} />
                          出席人数
                        </span>
                        <strong className="stat-value">
                          {total(event, data.members)}
                          <span>人</span>
                        </strong>
                      </h2>
                    </div>
                  </div>
                  <div className="filter-tabs" aria-label="出欠で絞り込み">
                    {(["すべて", "出席", "欠席", "未回答"] as const).map(
                      (f) => (
                        <button
                          key={f}
                          aria-label={f}
                          title={f}
                          aria-pressed={filter === f}
                          className={filter === f ? "selected" : ""}
                          onClick={() => setFilter(f)}
                        >
                          {f === "すべて" || f === "未回答" ? (
                            f
                          ) : (
                            <StatusMark status={f} />
                          )}
                          {f === "すべて" && <span>{data.members.length}</span>}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <div className="table-heading">
                  <span>メンバー / 備考</span>
                  <span>出欠</span>
                  <span>参加人数</span>
                  <span>最終更新</span>
                  <span />
                </div>
                <div className="member-list">
                  {data.members
                    .filter(
                      (m) =>
                        filter === "すべて" ||
                        (event.answers[m.id]?.status ?? "未回答") === filter,
                    )
                    .map((m) => {
                      const a = event.answers[m.id] ?? emptyAnswer();
                      const n = attendanceCount(a);
                      return (
                        <div className="member-row" key={m.id}>
                          <div className="member-info">
                            <strong>{m.name}</strong>
                            {a.note && <p>{a.note}</p>}
                            {a.status === "出席" && !a.includeSelf && (
                              <small className="self-note">
                                本人は人数に含めない
                              </small>
                            )}
                          </div>
                          <div className="member-status">
                            <span
                              className={`status-pill status-${a.status}`}
                              aria-label={a.status}
                              title={a.status}
                            >
                              <StatusMark status={a.status} />
                            </span>
                          </div>
                          <div className="member-total">
                            <strong>{n}</strong>
                            <span>人</span>
                          </div>
                          <div className="member-updated">
                            {updated(a.updatedAt)}
                          </div>
                          <button
                            className="edit-button"
                            onClick={() => openAnswer(m)}
                            aria-label={`${m.name}の出欠を編集`}
                          >
                            <Icon name="edit" size={15} />
                            編集
                          </button>
                        </div>
                      );
                    })}
                  {!data.members.some(
                    (m) =>
                      filter === "すべて" ||
                      (event.answers[m.id]?.status ?? "未回答") === filter,
                  ) && (
                    <div className="empty-state">
                      該当するメンバーはいません。
                    </div>
                  )}
                </div>
                <div className="panel-footer">
                  <span>
                    最終更新：{lastUpdate ? updated(lastUpdate) : "—"}
                  </span>
                </div>
              </div>
            </section>
          ) : (
            <div className="empty-state">開催日を追加しましょう。</div>
          )}
          <details className="member-settings">
            <summary>メンバー登録・編集</summary>
            <div className="roster-panel">
              <div className="member-settings-heading">
                <button
                  className="button primary"
                  disabled={!ready || busy}
                  onClick={() => {
                    setEditing(null);
                    setMemberName("");
                    setModal("member");
                  }}
                >
                  <Icon name="plus" size={17} />
                  メンバーを登録
                </button>
              </div>
              {data.members.map((m) => (
                <div className="roster-row" key={m.id}>
                  <strong>{m.name}</strong>
                  <div>
                    <button
                      className="edit-button"
                      onClick={() => {
                        setEditing(m);
                        setMemberName(m.name);
                        setModal("member");
                      }}
                    >
                      <Icon name="edit" size={16} />
                      編集
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${m.name}を削除`}
                      onClick={() =>
                        setConfirmation({
                          kind: "member",
                          id: m.id,
                          name: m.name,
                        })
                      }
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </div>
              ))}
              {!data.members.length && (
                <div className="empty-state">メンバーを追加しましょう。</div>
              )}
            </div>
          </details>
          {event && (
            <details className="event-settings member-settings">
              <summary>開催日の設定</summary>
              <div className="event-settings-body">
                <span>
                  {event.date.replaceAll("-", "/")}（
                  {dateParts(event.date).weekday}）
                </span>
                <button
                  className="button delete-date-button"
                  onClick={() => {
                    setDeleteDate("");
                    setConfirmation({
                      kind: "event",
                      id: event.id,
                      name: `${event.date.slice(0, 4)}年${dateParts(event.date).month}月${dateParts(event.date).day}日（${dateParts(event.date).weekday}）`,
                      date: event.date,
                    });
                  }}
                >
                  <Icon name="trash" size={17} />
                  この開催日を削除
                </button>
              </div>
            </details>
          )}
          </fieldset>
          <footer className="page-footer">
            <span className="footer-brand">
              <Icon name="ball" size={16} />
              FUTSAL NOTE
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {notice}
        </div>
      )}
      {modal === "calendar" && (
        <CalendarPicker
          events={data.events}
          members={data.members}
          selected={selected}
          onClose={close}
          onSelect={(id) => {
            setSelected(id);
            setFilter("すべて");
            close();
          }}
        />
      )}
      {modal === "event" && (
        <Modal title="開催日を追加" onClose={close}>
          <form aria-busy={busy}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const next: Event = {
                id: uid(),
                date: String(form.get("date")),
                answers: {},
              };
              if (!await save({ type: "add-event", id: next.id, date: next.date })) return;
              setSelected(next.id);
              setFilter("すべて");
              close();
              setNotice("開催日を追加しました");
            }}
          >
            <label className="field">
              開催日
              <input type="date" name="date" required defaultValue={today} />
            </label>
            {error && <p role="alert" className="form-help">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={close}
              >
                キャンセル
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                開催日を追加
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "member" && (
        <Modal
          title={editing ? "メンバーを編集" : "メンバーを追加"}
          onClose={close}
        >
          <form aria-busy={busy}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!memberName.trim()) return;
              if (!editing) setFilter("すべて");
              if (!await save({ type: "save-member", id: editing?.id ?? uid(), name: memberName.trim(), editing: !!editing })) return;
              close();
              setNotice(
                editing ? "メンバーを更新しました" : "メンバーを追加しました",
              );
            }}
          >
            <label className="field">
              名前
              <input
                required
                maxLength={60}
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="例：田中 健太"
                autoFocus
              />
            </label>
            <p className="form-help">
              固定メンバーとして、すべての開催日に表示されます。
            </p>
            {error && <p role="alert" className="form-help">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={close}
              >
                キャンセル
              </button>
              <button className="button primary" disabled={busy || !memberName.trim()}>
                保存する
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "answer" && editing && event && (
        <Modal title="出欠を編集" onClose={close}>
          <form aria-busy={busy}
            onSubmit={async (e) => {
              e.preventDefault();
              const nextAnswer = {
                ...answer,
                guests: guestName.trim()
                  ? [...answer.guests, guestName.trim()]
                  : answer.guests,
                updatedAt: new Date().toISOString(),
              };
              if (!await save({ type: "save-answer", eventId: event.id, memberId: editing.id, answer: nextAnswer })) return;
              close();
              setNotice(`${editing.name}の出欠を保存しました`);
            }}
          >
            <div className="editing-member">
              <strong>{editing.name}</strong>
              <span>
                {dateParts(event.date).month}月{dateParts(event.date).day}日（
                {dateParts(event.date).weekday}）
              </span>
            </div>
            <fieldset className="status-field">
              <legend>出欠</legend>
              <div className="status-options">
                {(["出席", "欠席", "未回答"] as Status[]).map((s) => (
                  <label
                    className={
                      answer.status === s
                        ? `status-option selected status-${s}`
                        : "status-option"
                    }
                    key={s}
                    title={s}
                  >
                    <input
                      type="radio"
                      aria-label={s}
                      name="status"
                      value={s}
                      checked={answer.status === s}
                      onChange={() => setAnswer({ ...answer, status: s })}
                    />
                    {s === "未回答" ? (
                      <span className="unanswered-label">未回答</span>
                    ) : (
                      <StatusMark status={s} />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="attendance-form">
              {answer.status === "出席" && (
                <button
                  type="button"
                  className={`self-toggle ${answer.includeSelf ? "selected" : ""}`}
                  aria-label="本人を含める"
                  aria-pressed={answer.includeSelf}
                  onClick={() =>
                    setAnswer({ ...answer, includeSelf: !answer.includeSelf })
                  }
                >
                  本人：{answer.includeSelf ? "含める" : "含めない"}
                </button>
              )}
              <div className="name-editor">
                <div className="guest-input">
                  <input
                    aria-label="追加する名前"
                    placeholder="名前"
                    maxLength={60}
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addGuest();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!guestName.trim()}
                    onClick={addGuest}
                  >
                    <Icon name="plus" size={17} />
                    追加
                  </button>
                </div>
                <div className="guest-list">
                  {answer.guests.map((name, index) => (
                    <div key={index}>
                      <input
                        aria-label={`追加した名前${index + 1}`}
                        placeholder="名前"
                        value={name}
                        maxLength={60}
                        onChange={(e) =>
                          setAnswer({
                            ...answer,
                            guests: answer.guests.map((g, i) =>
                              i === index ? e.target.value : g,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`追加した名前${index + 1}を削除`}
                        onClick={() =>
                          setAnswer({
                            ...answer,
                            guests: answer.guests.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Icon name="close" size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <label className="field">
              備考<span className="optional">任意</span>
              <textarea
                rows={3}
                maxLength={500}
                value={answer.note}
                onChange={(e) => setAnswer({ ...answer, note: e.target.value })}
              />
            </label>
            <p className="form-help">最終更新：{updated(answer.updatedAt)}</p>
            {error && <p role="alert" className="form-help">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={close}
              >
                キャンセル
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                変更を保存
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.kind === "event" ? "開催日を削除" : "メンバーを削除"
          }
          onClose={() => {
            setConfirmation(null);
            setDeleteDate("");
          }}
        >
          {confirmation.kind === "event" ? (
            <>
              <div className="delete-target">
                <small>削除する開催日</small>
                <strong>{confirmation.name}</strong>
              </div>
              <p className="confirm-text">
                この開催日の出欠・追加した名前・備考も削除されます。元に戻せません。
              </p>
              <label className="field">
                確認用の日付（8桁）
                <input
                  value={deleteDate}
                  inputMode="numeric"
                  maxLength={8}
                  autoComplete="off"
                  aria-describedby="delete-date-help"
                  onChange={(e) =>
                    setDeleteDate(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                />
              </label>
              <p className="form-help" id="delete-date-help">
                <strong>{confirmation.date?.replaceAll("-", "")}</strong>{" "}
                を入力すると削除できます。
              </p>
            </>
          ) : (
            <p className="confirm-text">
              「{confirmation.name}
              」を削除しますか？すべての開催日から、このメンバーの回答が削除されます。
            </p>
          )}
          {error && <p role="alert" className="form-help">{error}</p>}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                setConfirmation(null);
                setDeleteDate("");
              }}
            >
              キャンセル
            </button>
            <button
              className="button danger"
              disabled={
                busy || (confirmation.kind === "event" &&
                deleteDate !== confirmation.date?.replaceAll("-", ""))
              }
              onClick={async () => {
                if (confirmation.kind === "event") {
                  if (deleteDate !== confirmation.date?.replaceAll("-", "")) return;
                  if (!await save({ type: "delete-event", id: confirmation.id, date: confirmation.date! })) return;
                } else {
                  if (!await save({ type: "delete-member", id: confirmation.id })) return;
                }
                setConfirmation(null);
                setDeleteDate("");
                setNotice("削除しました");
              }}
            >
              削除する
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
