import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSession, extractSessionId, mergeChats, urgentChatStatus, planModeSwitch, workStackChild,
} from "../mods/chats/logic.js";

test("parseSession prefers latest session_info.name over first user message", () => {
  const jsonl = [
    JSON.stringify({ type: "session", version: 3, id: "01a057ad-efd3-7716-9c35-24c817e97d6a", timestamp: "2026-08-31T11:56:52.051Z" }),
    JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "First prompt here" }] } }),
    JSON.stringify({ type: "session_info", name: "Old title" }),
    JSON.stringify({ type: "session_info", name: "  Renamed title  " }),
  ].join("\n");

  const res = parseSession("/home/u/.herdr/chats/pi/file.jsonl", jsonl);
  assert.deepEqual(res, {
    id: "01a057ad-efd3-7716-9c35-24c817e97d6a",
    path: "/home/u/.herdr/chats/pi/file.jsonl",
    title: "Renamed title",
    timestamp: "2026-08-31T11:56:52.051Z",
  });
});

test("parseSession falls back to first user message with <skill> stripped and truncates at 64 chars", () => {
  const longPrompt = "A".repeat(80);
  const jsonl = [
    "not valid json {",
    JSON.stringify({ type: "session", id: "11111111-2222-3333-4444-555555555555", timestamp: "2026-09-01T00:00:00Z" }),
    JSON.stringify({
      type: "message",
      message: {
        role: "user",
        content: [{ type: "text", text: `<skill name="x">ignored</skill>\n  ${longPrompt}` }],
      },
    }),
  ].join("\n");

  const res = parseSession("/tmp/x.jsonl", jsonl);
  assert.equal(res.id, "11111111-2222-3333-4444-555555555555");
  assert.equal(res.title, `${"A".repeat(63)}…`);
  assert.equal(res.title.length, 64);
});

test("parseSession defaults title to 'New chat' and extracts UUID from filename when header lacks id", () => {
  const res = parseSession(
    "/home/u/.herdr/chats/pi/2026-11-10T10-09-19-720Z_01a1c4ee-ff67-73b2-876f-40d96e164a34.jsonl",
    "",
  );
  assert.equal(res.id, "01a1c4ee-ff67-73b2-876f-40d96e164a34");
  assert.equal(res.title, "New chat");
  assert.equal(res.timestamp, null);
});

test("extractSessionId reads --session-id and --session file paths from array or string argv", () => {
  assert.equal(
    extractSessionId(["pi", "--session-dir", "/x", "--session-id", "01a1c4ee-ff67-73b2-876f-40d96e164a34"]),
    "01a1c4ee-ff67-73b2-876f-40d96e164a34",
  );
  assert.equal(
    extractSessionId('pi --session="/home/u/.herdr/chats/pi/2026-11-10_01a1c4ee-ff67-73b2-876f-40d96e164a34.jsonl"'),
    "01a1c4ee-ff67-73b2-876f-40d96e164a34",
  );
  assert.equal(extractSessionId(["bash"]), null);
});

test("mergeChats pairs live Chats tabs with disk sessions, places fresh live tabs first, and keeps saved-only rows", () => {
  const disk = [
    { id: "aaaaaaaa-1111-2222-3333-444444444444", path: "/p/a.jsonl", title: "Saved active", timestamp: "2026-11-10T10:00:00Z" },
    { id: "bbbbbbbb-1111-2222-3333-444444444444", path: "/p/b.jsonl", title: "Saved idle", timestamp: "2026-11-09T10:00:00Z" },
  ];
  const spaces = [
    { id: "sp-code", name: "proj", named: true, machine: null, active: false, tabs: [] },
    {
      id: "sp-chats", name: "Chats", named: true, machine: null, active: true,
      tabs: [
        { id: "tab-1", name: "Saved active", named: true, active: true },
        { id: "tab-fresh", name: "New chat", named: true, active: false },
        { id: "tab-shell", name: "Shell", named: true, active: false },
      ],
    },
  ];
  const panes = [
    { tab: "tab-1", terminal: "t1", program: { agent: true } },
    { tab: "tab-fresh", terminal: "t2", program: { agent: true } },
    { tab: "tab-shell", terminal: "t3", program: { agent: false } },
  ];
  const terminals = [
    { address: "t1", argv: ["pi", "--session", "/p/2026_aaaaaaaa-1111-2222-3333-444444444444.jsonl"] },
    { address: "t2", argv: ["pi", "--session-id", "cccccccc-1111-2222-3333-444444444444"] },
    { address: "t3", argv: ["bash"] },
  ];
  const agents = [
    { address: "t1", space: "sp-chats", status: "working" },
    { address: "t2", space: "sp-chats", status: "idle" },
  ];

  const rows = mergeChats({ disk, spaces, panes, terminals, agents });
  assert.deepEqual(
    rows.map((r) => ({ id: r.id, title: r.title, live: r.live, active: r.active, status: r.status, tabId: r.tabId })),
    [
      { id: "cccccccc-1111-2222-3333-444444444444", title: "New chat", live: true, active: false, status: "idle", tabId: "tab-fresh" },
      { id: "tab:tab-shell", title: "Shell", live: true, active: false, status: "idle", tabId: "tab-shell" },
      { id: "aaaaaaaa-1111-2222-3333-444444444444", title: "Saved active", live: true, active: true, status: "working", tabId: "tab-1" },
      { id: "bbbbbbbb-1111-2222-3333-444444444444", title: "Saved idle", live: false, active: false, status: null, tabId: null },
    ],
  );
});

test("urgentChatStatus returns highest priority non-idle status in Chats space only", () => {
  const spaces = [
    { id: "sp-code", name: "repo", named: true, machine: null },
    { id: "sp-chats", name: "Chats", named: true, machine: null },
  ];
  assert.equal(urgentChatStatus(spaces, [{ space: "sp-code", status: "blocked" }, { space: "sp-chats", status: "idle" }]), null);
  assert.equal(urgentChatStatus(spaces, [{ space: "sp-chats", status: "working" }, { space: "sp-chats", status: "done" }]), "done");
  assert.equal(urgentChatStatus(spaces, [{ space: "sp-chats", status: "done" }, { space: "sp-chats", status: "blocked" }]), "blocked");
});

test("planModeSwitch to chat saves active code space/tab and restores lastChatTab if Chats exists", () => {
  const spaces = [
    { id: "sp-code", name: "repo", named: true, machine: null, active: true, tabs: [{ id: "t-code", active: true }] },
    { id: "sp-chats", name: "Chats", named: true, machine: null, active: false, tabs: [{ id: "t-c1" }, { id: "t-c2" }] },
  ];
  assert.deepEqual(
    planModeSwitch({ currentMode: "code", target: "chat", spaces, lastChatTab: "t-c2" }),
    {
      sidebarChild: "chats",
      saveLastCode: { space: "sp-code", tab: "t-code" },
      saveLastChatTab: null,
      selectSpace: "sp-chats",
      selectTab: "t-c2",
    },
  );
});

test("planModeSwitch to chat with no Chats space leaves space selection null", () => {
  const spaces = [
    { id: "sp-code", name: "repo", named: true, machine: null, active: true, tabs: [{ id: "t-code", active: true }] },
  ];
  assert.deepEqual(
    planModeSwitch({ currentMode: "code", target: "chat", spaces }),
    {
      sidebarChild: "chats",
      saveLastCode: { space: "sp-code", tab: "t-code" },
      saveLastChatTab: null,
      selectSpace: null,
      selectTab: null,
    },
  );
});

test("planModeSwitch to code saves active chat tab and falls back to first Code space when lastCode was closed", () => {
  const spaces = [
    { id: "sp-chats", name: "Chats", named: true, machine: null, active: true, tabs: [{ id: "t-c1", active: true }] },
    { id: "sp-other", name: "other", named: true, machine: null, active: false, tabs: [{ id: "t-o1" }] },
  ];
  assert.deepEqual(
    planModeSwitch({ currentMode: "chat", target: "code", spaces, lastCode: { space: "sp-gone", tab: "t-gone" } }),
    {
      sidebarChild: "code",
      saveLastCode: null,
      saveLastChatTab: "t-c1",
      selectSpace: "sp-other",
      selectTab: null,
    },
  );
  assert.equal(planModeSwitch({ currentMode: "code", target: "code", spaces }), null);
});

test("workStackChild shows chat-empty only in chat mode when no Chats space exists", () => {
  const codeOnly = [{ id: "sp-1", name: "repo", named: true, machine: null }];
  const withChats = [...codeOnly, { id: "sp-2", name: "Chats", named: true, machine: null }];
  assert.equal(workStackChild("chat", codeOnly), "chat-empty");
  assert.equal(workStackChild("chat", withChats), "work");
  assert.equal(workStackChild("code", codeOnly), "work");
});
