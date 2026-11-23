// Ctrl+click on a file link opens it in the Companion Editor of the clicked terminal: the nvim
// that the `nv` script opened beside pi (my-pi-mono, CONTEXT.md, section Follow).
//
// The click names a terminal T on machine M. `nv` made $XDG_RUNTIME_DIR/nv-T.sock on M, so this
// runs `nvim --server` on that socket ON M. It answers "handled" when the Companion Editor took the
// click (or held back and said why) and "pass" when T has none, so the usual opener runs as before.
//
// A link opens at line 1, or at file:line[:col] when its text has that suffix.

import { exec, notify } from "herdr";

// Copy of JUMP_LUA in my-pi-mono/extensions/follow/index.ts: answers moved | typing | unsaved.
// Keep the two in step.
const LUA = [
  "(function(a)",
  'local mode = vim.api.nvim_get_mode().mode if mode:match("^[iRct]") or mode:match("^ni") then return "typing" end',
  "local buf",
  'for _, b in ipairs(vim.api.nvim_list_bufs()) do if vim.api.nvim_buf_is_loaded(b) and vim.fn.fnamemodify(vim.api.nvim_buf_get_name(b), ":p") == a.path then buf = b end end',
  "if buf and vim.bo[buf].modified then",
  'vim.notify(a.path .. " has unsaved changes: not reloaded", vim.log.levels.WARN)',
  'return "unsaved" end',
  "local win",
  "if buf then for _, w in ipairs(vim.fn.win_findbuf(buf)) do if vim.api.nvim_win_get_tabpage(w) == vim.api.nvim_get_current_tabpage() then win = w; break end end end",
  "if not win then vim.cmd.edit(vim.fn.fnameescape(a.path)); win = vim.api.nvim_get_current_win() end",
  "vim.api.nvim_win_call(win, function()",
  "vim.cmd.checktime()",
  "vim.api.nvim_win_set_cursor(0, { math.min(a.line, vim.api.nvim_buf_line_count(0)), a.col })",
  'vim.cmd("normal! zz")',
  "end)",
  'return "moved"',
  "end)(_A)",
].join(" ");

// Runs on the terminal's machine. Exit 3: no Companion Editor socket for that terminal.
const SCRIPT = 'sock="${XDG_RUNTIME_DIR:-/tmp}/nv-$1.sock"; [ -S "$sock" ] || exit 3; exec nvim --server "$sock" --remote-expr "$2"';

const vimString = (s) => s.replace(/'/g, "''");

// The click gives link.path (null for remote paths) and link.raw (text or OSC 8 target). Herdr
// drops a :line:col suffix from link.path and the payload has no line field, so read it from raw.
function target(link, source) {
  const raw = link.raw ?? "";
  let line = 1;
  let col = 0;
  const m = raw.match(/:(\d+)(?::(\d+))?$/);
  if (m) {
    line = Number(m[1]);
    col = m[2] ? Number(m[2]) - 1 : 0;
  }
  let path = link.path ?? (raw.startsWith("file://") ? decodeURIComponent(raw.replace(/^file:\/\/[^/]*/, "")) : raw);
  path = path.replace(/^@/, "").replace(/:\d+(?::\d+)?$/, "");
  if (!path.startsWith("/") && source.cwd) path = `${source.cwd.replace(/\/$/, "")}/${path.replace(/^\.\//, "")}`;
  return { path, line, col };
}

const toast = (level, body) => notify({ title: "nv-link", body, level, timeout: 6000 });

export async function handleLink({ link, source }) {
  if (link.kind !== "file") return "pass";
  try {
    const jump = target(link, source);
    // A remote terminal may come qualified ("machine/t7"); the socket is named by its own address.
    const terminal = String(source.terminal).split("/").pop();
    const expr = `luaeval('${vimString(LUA)}', json_decode('${vimString(JSON.stringify(jump))}'))`;
    const r = await exec("sh", ["-c", SCRIPT, "sh", terminal, expr], { on: source.machine, timeout: 3000 });
    if (r.code === 3) return "pass"; // an ordinary terminal: nothing to open in
    if (r.code !== 0) {
      toast("warning", `nvim failed (${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
      return "pass";
    }
    const said = r.stdout.trim();
    if (said === "typing") toast("warning", "Not opened: the Companion Editor is in a typing mode");
    else if (said === "unsaved") toast("warning", `Not opened: ${jump.path} has unsaved changes in the Companion Editor`);
    return "handled";
  } catch (e) {
    toast("error", `nv-link failed: ${e}`);
    return "pass";
  }
}
