// PROTOTYPE, THROWAWAY. Question it answers: can a herdr link-handler mod send a Ctrl+clicked
// file link to the Companion Editor (the nvim `nv` opened beside pi) of the clicked terminal?
// See CONTEXT.md in my-pi-mono, section Follow. Nothing here is production code.
//
// Flow: click on a file link in terminal T on machine M ->
//   run `nvim --server $XDG_RUNTIME_DIR/nv-T.sock --remote-expr ...` ON M (that is where `nv`
//   made the socket) -> "handled" if the Companion Editor took it, "pass" if there is none
//   (the system opener then behaves as before).
// Every click leaves what it received and what happened in <appHome>/nv-link-last-click.json
// and as a toast, so the real payload can be read afterwards.

import { exec, notify, appHome, readTextFile, writeTextFile } from "herdr";

// Copy of JUMP_LUA in my-pi-mono/extensions/follow/index.ts: answers moved | typing | unsaved.
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

export async function handleLink(click) {
  const { link, source } = click;
  const record = { click, jump: null, terminal: null, result: null };
  try {
    if (link.kind !== "file") return "pass";
    record.jump = target(link, source);
    // A remote terminal may come qualified ("machine/t7"); the socket is named by its own address.
    record.terminal = String(source.terminal).split("/").pop();
    const expr = `luaeval('${vimString(LUA)}', json_decode('${vimString(JSON.stringify(record.jump))}'))`;
    const r = await exec("sh", ["-c", SCRIPT, "sh", record.terminal, expr], { on: source.machine, timeout: 3000 });
    record.result = { code: r.code, stdout: r.stdout.trim(), stderr: r.stderr.trim() };

    const where = `${record.jump.path}:${record.jump.line}`;
    if (r.code === 3) return say(record, "info", `No Companion Editor for ${record.terminal}: opened the usual way`, "pass");
    if (r.code !== 0) return say(record, "warning", `nvim failed (${r.code}): ${r.stderr.trim() || r.stdout.trim()}`, "pass");
    const said = r.stdout.trim();
    if (said === "typing") return say(record, "warning", "Not opened: the Companion Editor is in a typing mode", "handled");
    if (said === "unsaved") return say(record, "warning", `Not opened: ${where} has unsaved changes in the Companion Editor`, "handled");
    return say(record, "success", `Opened ${where} in the Companion Editor`, "handled");
  } catch (e) {
    record.result = { error: String(e) };
    return say(record, "error", `nv-link failed: ${e}`, "pass");
  }
}

function say(record, level, body, answer) {
  notify({ title: "nv-link (prototype)", body, level, timeout: 6000 });
  record.answer = answer;
  // writeTextFile replaces a file only when told what it currently holds.
  const file = `${appHome()}/nv-link-last-click.json`;
  readTextFile(file)
    .then((old) => writeTextFile(file, JSON.stringify(record, null, 2), old))
    .catch(() => {});
  return answer;
}
