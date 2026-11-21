// Code / Chat sidebar mode toggle and Pi chats list (~/.herdr/chats/pi).
// Roles via props():
//   { toggle: true }             -> top Code | Chat switcher (also handles `chats.toggle`)
//   { dialog: "menu", chat }     -> right-click context menu for a chat row
//   { dialog: "rename", chat }   -> rename chat dialog
//   { dialog: "delete", chat }   -> confirm delete dialog
//   (default)                    -> Chats list panel

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import {
  spaces, panes, terminals, agents, theme, run, exec, home, checking,
  readTextFile, watchFolder, props, shared, setShared, layout,
  openOverlay, closeOverlay, nextCommand,
} from "herdr";
import {
  CHATS_SPACE, isChatsSpace, parseSession, mergeChats, urgentChatStatus,
  planModeSwitch, workStackChild,
} from "./logic.js";

const chatsRoot = () => `${home()}/.herdr/chats`;
const piDir = () => `${home()}/.herdr/chats/pi`;

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (findNode(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
const currentMode = () => findNode(layout(), "sidebar-body")?.active === "chats" ? "chat" : "code";

function uuid4() {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function switchMode(target) {
  const plan = planModeSwitch({
    currentMode: currentMode(),
    target,
    spaces: spaces(),
    lastCode: shared("sidebar.lastCode"),
    lastChatTab: shared("sidebar.lastChatTab"),
  });
  if (!plan) return;
  if (plan.saveLastCode) setShared("sidebar.lastCode", plan.saveLastCode);
  if (plan.saveLastChatTab) setShared("sidebar.lastChatTab", plan.saveLastChatTab);
  setShared("sidebar.mode", target);
  run("layout.select", { stack: "sidebar-body", child: plan.sidebarChild });
  if (plan.selectSpace) run("space.select", { id: plan.selectSpace });
  if (plan.selectTab) run("tab.select", { id: plan.selectTab });
}

function openChatTab(argv, tabName) {
  const cs = spaces().find(isChatsSpace);
  if (cs) {
    run("space.select", { id: cs.id });
    run("tab.new", { space: cs.id, folder: chatsRoot(), argv, ...(tabName ? { name: tabName } : {}) });
  } else {
    run("space.new", { name: CHATS_SPACE, folder: chatsRoot(), argv, ...(tabName ? { tab: tabName } : {}) });
  }
}

export default class Chats extends View {
  init(_p, cx) {
    const p = props();
    this.role = p?.toggle ? "toggle" : p?.empty ? "empty" : p?.dialog ?? "list";
    this.disk = [];
    this.lastRev = shared("chats.rev") ?? 0;
    this.watch = null;

    if (this.role === "toggle") {
      if (checking()) return;
      cx.spawn(async () => {
        for (;;) {
          const cmd = await nextCommand();
          if (cmd === "toggle") switchMode(currentMode() === "chat" ? "code" : "chat");
          else if (cmd === "chat") switchMode("chat");
          else if (cmd === "code") switchMode("code");
          else if (cmd === "close_tab") {
            const active = spaces().find((s) => s.active);
            run("tab.close", isChatsSpace(active) ? { confirmed: true } : {});
          }
        }
      });
      return;
    }

    if (this.role === "rename") {
      this.text = p?.chat?.title ?? "";
      this.input = InputState.new({ value: this.text });
      if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
      this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
      this.input.on("submit", (_e, cx) => this.submitRename(cx));
      this.inputFocused = true;
      this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
      this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
      this.input.focus();
      this.handle = cx.focus_handle();
      return;
    }

    if (this.role === "delete") {
      this.handle = cx.focus_handle();
      this.handle.focus();
      return;
    }

    if (this.role === "list") {
      if (checking()) return;
      cx.spawn(async (cx) => {
        try { await exec("mkdir", ["-p", piDir()]); } catch {}
        await this.refresh(cx);
        this.startWatch(cx);
      });
      // Fallback poll for writes/renames when watch misses an event.
      cx.timer.every(5000, (cx) => this.refresh(cx));
    }
  }

  async close() {
    if (this.watch) this.watch.cancel();
  }

  startWatch(cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          this.watch = watchFolder(piDir());
          const changed = await this.watch;
          this.watch = null;
          if (!changed.length) return;
          await this.refresh(cx);
        } catch {
          this.watch = null;
          return;
        }
      }
    });
  }

  async refresh(cx) {
    try {
      const r = await exec("ls", ["-1t", piDir()]);
      if (r.code !== 0) return;
      const files = r.stdout.split("\n").map((f) => f.trim()).filter((f) => f.endsWith(".jsonl"));
      const entries = [];
      for (const f of files) {
        const path = `${piDir()}/${f}`;
        const text = await readTextFile(path);
        if (text != null) entries.push(parseSession(path, text));
      }
      this.disk = entries;
      cx.notify();
    } catch {}
  }

  newChat() {
    const id = uuid4();
    openChatTab(["pi", "--session-dir", piDir(), "--session-id", id], "New chat");
  }

  openChat(chat) {
    if (chat.tabId && chat.spaceId) {
      run("space.select", { id: chat.spaceId });
      run("tab.select", { id: chat.tabId });
      setShared("sidebar.lastChatTab", chat.tabId);
      return;
    }
    if (chat.path) {
      openChatTab(["pi", "--session-dir", piDir(), "--session", chat.path], chat.title);
    }
  }

  submitRename(cx) {
    const p = props();
    const chat = p?.chat;
    const name = this.text.trim();
    closeOverlay(p.overlay);
    if (!chat || !name) return;
    if (chat.tabId) run("tab.rename", { id: chat.tabId, name });
    if (chat.path) {
      const entry = JSON.stringify({
        type: "session_info",
        id: uuid4().slice(0, 8),
        parentId: null,
        timestamp: new Date().toISOString(),
        name,
      });
      cx.spawn(async () => {
        await exec("sh", ["-c", 'printf "%s\\n" "$1" >> "$2"', "_", entry, chat.path]);
        setShared("chats.rev", Date.now());
      });
    }
  }

  confirmDelete(cx) {
    const p = props();
    const chat = p?.chat;
    closeOverlay(p.overlay);
    if (!chat) return;
    if (chat.tabId) run("tab.close", { id: chat.tabId, confirmed: true });
    if (chat.path) {
      cx.spawn(async () => {
        await exec("rm", ["-f", chat.path]);
        setShared("chats.rev", Date.now());
      });
    }
  }

  renderToggle() {
    const t = theme();
    const mode = currentMode();
    const collapsed = narrow();
    const allSpaces = spaces();
    const chatStatus = urgentChatStatus(allSpaces, agents());
    const wantWork = workStackChild(mode, allSpaces);
    const workStack = findNode(layout(), "work-stack");
    if (workStack && workStack.active !== wantWork) {
      run("layout.select", { stack: "work-stack", child: wantWork });
    }
    const pill = (id, label, short, target) => {
      const on = mode === target;
      return h_flex()
        .id(`mode-${id}`)
        .flex_1()
        .h(24)
        .px(collapsed ? 0 : 8)
        .gap(6)
        .items_center()
        .justify_center()
        .rounded(6)
        .cursor_pointer()
        .text_size(collapsed ? 11 : 12.2)
        .font_medium()
        .bg(on ? t.raised : t.chrome)
        .text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(on ? t.raised : t.hover).text_color(t.foreground))
        .on_click(() => switchMode(target))
        .child(collapsed ? short : label)
        .when(target === "chat" && Boolean(chatStatus) && !on, (el) =>
          el.child(div().size(6).rounded_full().bg(t[chatStatus] ?? t.accent)));
    };
    return h_flex()
      .size_full()
      .bg(t.chrome)
      .px(collapsed ? 4 : 10)
      .pb(6)
      .items_center()
      .child(
        h_flex()
          .w_full()
          .p(2)
          .gap(2)
          .rounded(8)
          .border_1()
          .border_color(t.border)
          .bg(t.background)
          .child(pill("code", "Code", "C", "code"))
          .child(pill("chat", "Chat", "Pi", "chat")),
      );
  }

  renderMenu() {
    const t = theme();
    const p = props() ?? {};
    const chat = p.chat;
    const item = (id, label, danger, action) =>
      h_flex()
        .id(id)
        .h(30)
        .px(10)
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .text_size(12.8)
        .text_color(danger ? t.blocked : t.foreground)
        .hover((s) => s.bg(t.hover))
        .on_click(() => { closeOverlay(p.overlay); action(); })
        .child(label);
    return v_flex()
      .size_full()
      .p(6)
      .gap(2)
      .bg(t.popover)
      .when(Boolean(chat?.live), (el) =>
        el.child(item("m-close", "Close live tab", false, () => run("tab.close", { id: chat.tabId, confirmed: true }))))
      .child(item("m-rename", "Rename chat", false, () =>
        openOverlay({ mod: "chats", kind: "dialog", width: 380, height: 190, props: { dialog: "rename", chat } })))
      .child(item("m-delete", "Delete chat", true, () =>
        openOverlay({ mod: "chats", kind: "dialog", width: 360, height: 160, props: { dialog: "delete", chat } })));
  }

  renderRename() {
    const t = theme();
    const p = props() ?? {};
    const btn = (id, label, primary, action) =>
      h_flex().id(id).h(32).px(14).items_center().rounded(8)
        .border_1().border_color(primary ? t.solid : t.input)
        .bg(primary ? t.solid : t.raised)
        .text_color(primary ? t.solid_foreground : t.foreground)
        .text_size(12.5).font_medium().cursor_pointer()
        .hover((s) => s.opacity(0.88)).on_click(action).child(label);
    return v_flex()
      .id("chat-rename")
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .size_full()
      .p(18)
      .gap(12)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("Rename chat"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1()
        .border_color(this.inputFocused ? t.accent : t.input)
        .bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().pt(6).gap(8).justify_end()
        .child(btn("rn-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(btn("rn-save", "Save", true, (_e, cx) => this.submitRename(cx))));
  }

  renderDelete() {
    const t = theme();
    const p = props() ?? {};
    const title = p?.chat?.title ?? "this chat";
    const btn = (id, label, bg, fg, action) =>
      h_flex().id(id).h(32).px(14).items_center().rounded(8)
        .border_1().border_color(id === "del-no" ? t.input : bg)
        .bg(bg).text_color(fg).text_size(12.5).font_medium().cursor_pointer()
        .hover((s) => s.opacity(0.88)).on_click(action).child(label);
    return v_flex()
      .id("chat-delete")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.confirmDelete(cx);
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.stop_propagation();
      })
      .size_full()
      .p(18)
      .gap(12)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("Delete chat?"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().flex_1().text_size(12.8).text_color(t.muted).child(`Delete "${title}" and its session file?`))
      .child(h_flex().gap(8).justify_end()
        .child(btn("del-no", "Cancel", t.raised, t.foreground, () => closeOverlay(p.overlay)))
        .child(btn("del-yes", "Delete", t.blocked, t.solid_foreground, (_e, cx) => this.confirmDelete(cx))));
  }

  renderList(cx) {
    const t = theme();
    const collapsed = narrow();
    const rev = shared("chats.rev") ?? 0;
    if (rev !== this.lastRev) {
      this.lastRev = rev;
      if (!checking()) cx.spawn((cx) => this.refresh(cx));
    }
    const items = mergeChats({
      disk: this.disk,
      spaces: spaces(),
      panes: panes(),
      terminals: terminals(),
      agents: agents(),
    });

    const dotColor = (chat) => {
      if (!chat.live) return null;
      return t[chat.status] ?? t.idle;
    };

    const row = (chat, i) => {
      const dc = dotColor(chat);
      return h_flex()
        .id(`chat-${i}-${chat.id}`)
        .h(30)
        .px(collapsed ? 0 : 8)
        .gap(8)
        .items_center()
        .when(collapsed, (el) => el.justify_center().tooltip(chat.title))
        .rounded(7)
        .cursor_pointer()
        .bg(chat.active ? t.selected : t.chrome)
        .text_color(chat.active ? t.foreground : chat.live ? t.foreground : t.muted)
        .hover((s) => s.bg(chat.active ? t.selected : t.hover).text_color(t.foreground))
        .on_click(() => this.openChat(chat))
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({
            mod: "chats",
            kind: "popup",
            width: 170,
            height: chat.live ? 108 : 76,
            props: { dialog: "menu", chat },
          });
        })
        .child(
          div()
            .size(7)
            .flex_none()
            .rounded_full()
            .when(Boolean(dc), (el) => el.bg(dc))
            .when(!dc, (el) => el.border_1().border_color(t.dim)),
        )
        .when(!collapsed, (el) =>
          el.child(div().flex_1().min_w(0).truncate().text_size(12.8).child(chat.title)));
    };

    return v_flex()
      .size_full()
      .bg(t.chrome)
      .px(collapsed ? 4 : 8)
      .pb(8)
      .gap(6)
      .child(
        h_flex()
          .id("new-chat")
          .h(30)
          .px(collapsed ? 0 : 10)
          .gap(6)
          .items_center()
          .justify_center()
          .rounded(7)
          .border_1()
          .border_color(t.border)
          .bg(t.raised)
          .text_color(t.foreground)
          .text_size(12.6)
          .font_medium()
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.newChat())
          .child(collapsed ? "+" : "+ New chat"),
      )
      .child(
        v_flex()
          .id("chats-scroll")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .gap(2)
          .when(items.length === 0 && !collapsed, (el) =>
            el.child(div().px(8).py(12).text_size(12).text_color(t.dim).child("No chats yet")))
          .children(items.map(row)),
      );
  }

  renderEmpty() {
    const t = theme();
    return v_flex()
      .size_full()
      .bg(t.canvas)
      .items_center()
      .justify_center()
      .gap(12)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("No open chats"))
      .child(div().text_size(12.8).text_color(t.muted).child("Start a new Pi chat or pick one from the sidebar."))
      .child(
        h_flex()
          .id("empty-new-chat")
          .mt(4)
          .h(34)
          .px(16)
          .items_center()
          .rounded(8)
          .bg(t.solid)
          .text_color(t.solid_foreground)
          .text_size(13)
          .font_medium()
          .cursor_pointer()
          .hover((s) => s.opacity(0.88))
          .on_click(() => this.newChat())
          .child("+ New chat"),
      );
  }

  render(cx) {
    if (this.role === "toggle") return this.renderToggle();
    if (this.role === "empty") return this.renderEmpty();
    if (this.role === "menu") return this.renderMenu();
    if (this.role === "rename") return this.renderRename();
    if (this.role === "delete") return this.renderDelete();
    return this.renderList(cx);
  }
}
