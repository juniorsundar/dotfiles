export const CHATS_SPACE = "Chats";
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
export const isChatsSpace = (s) => !s?.machine && Boolean(s?.named) && s?.name === CHATS_SPACE;

export function extractSessionId(argv) {
  const cmd = Array.isArray(argv) ? argv.join(" ") : String(argv ?? "");
  const m1 = cmd.match(/--session-id[=\s]+["']?([0-9a-f-]{8,})["']?/i);
  if (m1) return m1[1];
  const m2 = cmd.match(/--session[=\s]+["']?[^"'\s]*?([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl["']?/i);
  if (m2) return m2[1];
  return null;
}

export function parseSession(path, text) {
  let id = null;
  let timestamp = null;
  let name = null;
  let firstUser = null;
  for (const raw of (text ?? "").split("\n")) {
    if (!raw.trim()) continue;
    let obj;
    try { obj = JSON.parse(raw); } catch { continue; }
    if (obj.type === "session") {
      id = obj.id ?? id;
      timestamp = obj.timestamp ?? timestamp;
    } else if (obj.type === "session_info" && obj.name) {
      name = String(obj.name).trim();
    } else if (!firstUser && obj.type === "message" && obj.message?.role === "user") {
      const content = obj.message.content;
      const rawText = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.filter((c) => c?.type === "text" && c.text).map((c) => c.text).join(" ")
          : "";
      const cleaned = rawText.replace(/<skill[\s\S]*?<\/skill>/g, "").replace(/\s+/g, " ").trim();
      if (cleaned) firstUser = cleaned.length > 64 ? `${cleaned.slice(0, 63)}…` : cleaned;
    }
  }
  if (!id) {
    const m = path.match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i);
    id = m ? m[1] : path;
  }
  return { id, path, title: name || firstUser || "New chat", timestamp };
}

export function urgentChatStatus(allSpaces, allAgents) {
  const cs = (allSpaces ?? []).find(isChatsSpace);
  if (!cs) return null;
  let best = null;
  let bestRank = 0;
  for (const a of allAgents ?? []) {
    if (a.space !== cs.id) continue;
    const r = RANK[a.status] ?? 0;
    if (r > bestRank && a.status !== "idle") { best = a.status; bestRank = r; }
  }
  return best;
}

export function mergeChats({ disk = [], spaces = [], panes = [], terminals = [], agents = [] }) {
  const cs = spaces.find(isChatsSpace);
  const liveById = new Map();
  const liveUnmatched = [];

  for (const tab of cs?.tabs ?? []) {
    const pane = panes.find((p) => p.tab === tab.id && p.program?.agent)
      ?? panes.find((p) => p.tab === tab.id);
    const term = pane?.terminal ? terminals.find((t) => t.address === pane.terminal) : null;
    const agent = pane?.terminal ? agents.find((a) => a.address === pane.terminal) : null;
    const sid = extractSessionId(term?.argv);
    const info = {
      spaceId: cs.id,
      tabId: tab.id,
      active: Boolean(cs.active && tab.active),
      status: agent?.status ?? pane?.status ?? "idle",
      tabName: tab.named ? tab.name : null,
    };
    if (sid) liveById.set(sid, info);
    else liveUnmatched.push({ id: `tab:${tab.id}`, path: null, title: info.tabName || "New chat", ...info });
  }

  const seen = new Set();
  const merged = [];

  for (const d of disk) {
    const live = liveById.get(d.id) ?? null;
    if (live) seen.add(d.id);
    merged.push({
      id: d.id,
      path: d.path,
      title: d.title,
      live: Boolean(live),
      spaceId: live?.spaceId ?? null,
      tabId: live?.tabId ?? null,
      active: Boolean(live?.active),
      status: live?.status ?? null,
    });
  }

  const fresh = [];
  for (const [sid, live] of liveById) {
    if (seen.has(sid)) continue;
    fresh.push({
      id: sid,
      path: null,
      title: live.tabName || "New chat",
      live: true,
      ...live,
    });
  }
  for (const u of liveUnmatched) fresh.push({ ...u, live: true });

  return [...fresh, ...merged];
}

export function workStackChild(mode, allSpaces) {
  return mode === "chat" && !(allSpaces ?? []).some(isChatsSpace) ? "chat-empty" : "work";
}

export function planModeSwitch({ currentMode, target, spaces = [], lastCode = null, lastChatTab = null }) {
  if (target === currentMode) return null;
  const activeSpace = spaces.find((s) => s.active);
  const cs = spaces.find(isChatsSpace);

  if (target === "chat") {
    const saveLastCode = activeSpace && !isChatsSpace(activeSpace)
      ? { space: activeSpace.id, tab: activeSpace.tabs?.find((t) => t.active)?.id ?? null }
      : null;
    const selectTab = cs && lastChatTab && cs.tabs?.some((t) => t.id === lastChatTab) ? lastChatTab : null;
    return {
      sidebarChild: "chats",
      saveLastCode,
      saveLastChatTab: null,
      selectSpace: cs?.id ?? null,
      selectTab,
    };
  }

  const saveLastChatTab = activeSpace && isChatsSpace(activeSpace)
    ? activeSpace.tabs?.find((t) => t.active)?.id ?? null
    : null;
  const dest = (lastCode?.space && spaces.find((s) => s.id === lastCode.space && !isChatsSpace(s)))
    ?? spaces.find((s) => !isChatsSpace(s))
    ?? null;
  const selectTab = dest && lastCode?.tab && dest.tabs?.some((t) => t.id === lastCode.tab) ? lastCode.tab : null;
  return {
    sidebarChild: "code",
    saveLastCode: null,
    saveLastChatTab,
    selectSpace: dest?.id ?? null,
    selectTab,
  };
}
