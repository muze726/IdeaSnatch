const STORAGE_KEY = "inspiration_items_v1";
let lastSavedId = null;
let tagsState = [];
const UI_CAPTURE_COLLAPSED_KEY = "ui_capture_collapsed_v1";
let captureCollapsed = true;

function $(id) {
  return document.getElementById(id);
}

function on(id, eventName, handler) {
  const el = $(id);
  if (!el) {
    console.warn(`[IdeaSnatch] missing element: #${id}`);
    return null;
  }
  el.addEventListener(eventName, handler);
  return el;
}

function nowIso() {
  return new Date().toISOString();
}

function miniId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTag(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function parseTagsFromText(raw) {
  return (raw || "")
    .split(/[,，\n\r]+/g)
    .map(normalizeTag)
    .filter(Boolean);
}

function uniqTags(list) {
  const out = [];
  const seen = new Set();
  for (const t of list) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

function setTags(next) {
  tagsState = uniqTags(next);
  renderTagChips(tagsState);
}

function addTagsFromText(raw) {
  const parts = parseTagsFromText(raw);
  if (!parts.length) return;
  setTags([...tagsState, ...parts]);
}

function formatTime(iso) {
  const d = new Date(iso);
  const pad = (n) => `${n}`.padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderRecentTitle(total) {
  const el = $("recentTitle");
  if (!el) return;
  el.textContent = `最近保存（最新 10 条 / 共 ${total} 条）`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function capturePageContext(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const sel = window.getSelection?.();
      const selectionText = sel ? sel.toString() : "";
      return {
        title: document.title || "",
        url: location.href || "",
        selectionText: selectionText || "",
      };
    },
  });
  return result;
}

async function readAll() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  const items = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  return items;
}

async function writeAll(items) {
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

async function readUiState() {
  const data = await chrome.storage.local.get([UI_CAPTURE_COLLAPSED_KEY]);
  captureCollapsed = data[UI_CAPTURE_COLLAPSED_KEY] !== false; // default collapsed
}

async function writeUiState() {
  await chrome.storage.local.set({ [UI_CAPTURE_COLLAPSED_KEY]: captureCollapsed });
}

async function deleteById(id) {
  const items = await readAll();
  const next = items.filter((x) => x.id !== id);
  await writeAll(next);
  return { before: items.length, after: next.length };
}

function setToast(message, type) {
  const toast = $("toast");
  toast.textContent = message || "";
  toast.classList.remove("toast--good", "toast--bad");
  if (type === "good") toast.classList.add("toast--good");
  if (type === "bad") toast.classList.add("toast--bad");
}

function renderTagChips(tags) {
  const wrap = $("tagChips");
  wrap.innerHTML = "";
  if (!tags.length) return;

  for (const t of tags) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = t;

    const x = document.createElement("button");
    x.type = "button";
    x.className = "chip__x";
    x.textContent = "×";
    x.addEventListener("click", () => {
      setTags(tagsState.filter((x) => x !== t));
    });

    chip.appendChild(x);
    wrap.appendChild(chip);
  }
}

async function exportAll(format) {
  const items = await readAll();
  const dt = new Date();
  const stamp = `${dt.getFullYear()}${`${dt.getMonth() + 1}`.padStart(2, "0")}${`${dt.getDate()}`.padStart(
    2,
    "0"
  )}_${`${dt.getHours()}`.padStart(2, "0")}${`${dt.getMinutes()}`.padStart(2, "0")}`;

  let content = "";
  let bytes = null;
  let mime = "application/json";
  let ext = "json";

  const toExcelTsvUtf16leBytes = (rows) => {
    // Excel on both Windows and macOS reliably detects UTF-16LE with BOM.
    const s = rows.join("\r\n") + "\r\n";
    const out = new Uint8Array(2 + s.length * 2);
    out[0] = 0xff;
    out[1] = 0xfe; // UTF-16LE BOM
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      out[2 + i * 2] = code & 0xff;
      out[2 + i * 2 + 1] = (code >> 8) & 0xff;
    }
    return out;
  };

  if (format === "csv") {
    ext = "csv";
    mime = "text/csv;charset=utf-8";
    const headers = ["createdAt", "title", "url", "selectionText", "note", "tags"];
    const escapeCsv = (v) => {
      const s = v == null ? "" : String(v);
      const needs = /[",\n\r]/.test(s);
      const safe = s.replace(/"/g, '""');
      return needs ? `"${safe}"` : safe;
    };
    const lines = [];
    lines.push(headers.join(","));
    for (const it of items) {
      const row = [
        it.createdAt,
        it.title,
        it.url,
        it.selectionText,
        it.note,
        Array.isArray(it.tags) ? it.tags.join(" | ") : "",
      ].map(escapeCsv);
      lines.push(row.join(","));
    }
    // Excel often mis-detects UTF-8 CSV without BOM; add BOM + CRLF for better compatibility.
    content = `\uFEFF${lines.join("\r\n")}\r\n`;
  } else if (format === "excel") {
    // TSV (tab-separated) + UTF-16LE BOM is the most Excel-friendly option across Windows/macOS.
    ext = "tsv";
    mime = "text/tab-separated-values;charset=utf-16le";
    const headers = ["createdAt", "title", "url", "selectionText", "note", "tags"];
    const escapeTsv = (v) => {
      const s = v == null ? "" : String(v);
      return s.replace(/\t/g, " ").replace(/\r?\n/g, "\\n");
    };
    const lines = [];
    lines.push(headers.join("\t"));
    for (const it of items) {
      const row = [
        it.createdAt,
        it.title,
        it.url,
        it.selectionText,
        it.note,
        Array.isArray(it.tags) ? it.tags.join(" | ") : "",
      ].map(escapeTsv);
      lines.push(row.join("\t"));
    }
    bytes = toExcelTsvUtf16leBytes(lines);
  } else if (format === "jsonl") {
    ext = "jsonl";
    mime = "application/x-ndjson";
    content = items.map((x) => JSON.stringify(x)).join("\n") + "\n";
  } else {
    content = JSON.stringify(items, null, 2) + "\n";
  }

  const blob = new Blob([bytes ?? content], { type: mime });
  const url = URL.createObjectURL(blob);
  const filename = `灵感捕手_${stamp}.${ext}`;

  await chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  });

  // 给下载留一点时间，避免 URL 过早释放导致偶发失败
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function renderRecent(items, opts) {
  const list = $("recentList");
  list.innerHTML = "";
  renderRecentTitle(items.length);
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "recent__empty";
    empty.textContent = "还没有保存过灵感。";
    list.appendChild(empty);
    return;
  }

  for (const it of items.slice(0, 10)) {
    const el = document.createElement("div");
    el.className = "item";
    if (opts?.highlightId && it.id === opts.highlightId) el.classList.add("item--new");
    el.addEventListener("click", async () => {
      const tab = await getActiveTab();
      if (!it.url) return;
      await chrome.tabs.create({ url: it.url, index: (tab?.index ?? 0) + 1 });
    });

    const content = document.createElement("div");

    const title = document.createElement("div");
    title.className = "item__title";
    title.textContent = it.title || "(无标题)";

    const meta = document.createElement("div");
    meta.className = "item__meta";

    const time = document.createElement("span");
    time.className = "item__pill";
    time.textContent = formatTime(it.createdAt);
    meta.appendChild(time);

    if (Array.isArray(it.tags) && it.tags.length) {
      const tag = document.createElement("span");
      tag.className = "item__pill";
      tag.textContent = it.tags.slice(0, 3).join(" / ");
      meta.appendChild(tag);
    }

    if (it.selectionText) {
      const pick = document.createElement("span");
      pick.className = "item__pill";
      pick.textContent = `${it.selectionText.length}字选中`;
      meta.appendChild(pick);
    }

    content.appendChild(title);
    content.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "item__actions";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn icon-btn--danger";
    del.title = "删除这条灵感";
    del.textContent = "×";
    del.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ok = confirm("确定删除这条灵感吗？删除后无法恢复。");
      if (!ok) return;
      await deleteById(it.id);
      if (lastSavedId === it.id) lastSavedId = null;
      setToast("已删除。", "good");
      await refreshRecent();
    });

    actions.appendChild(del);

    el.appendChild(content);
    el.appendChild(actions);
    list.appendChild(el);
  }
}

async function refreshRecent() {
  const items = await readAll();
  renderRecent(items, { highlightId: lastSavedId });
}

async function initPageContext() {
  setToast("", "");

  const tab = await getActiveTab();
  if (!tab?.id) {
    $("title").textContent = "";
    $("url").textContent = "";
    $("selection").textContent = "";
    setToast("没找到当前页面标签页。", "bad");
    return;
  }

  try {
    const ctx = await capturePageContext(tab.id);
    $("title").textContent = ctx.title || tab.title || "";
    $("url").textContent = ctx.url || tab.url || "";
    $("url").href = ctx.url || tab.url || "#";
    $("selection").textContent = ctx.selectionText || "";
    renderCaptureSummary();
  } catch (e) {
    $("title").textContent = tab.title || "";
    $("url").textContent = tab.url || "";
    $("url").href = tab.url || "#";
    $("selection").textContent = "";
    setToast("这个页面不支持读取选中文本（比如浏览器内置页）。", "bad");
    renderCaptureSummary();
  }
}

function renderCaptureSummary() {
  const el = $("captureSummary");
  if (!el) return;
  const title = $("title")?.textContent?.trim() || "";
  const url = $("url")?.textContent?.trim() || "";
  const sel = $("selection")?.textContent?.trim() || "";
  const parts = [];
  if (title) parts.push(title);
  if (sel) parts.push(`${Math.min(sel.length, 18)}字选中`);
  if (!parts.length && url) parts.push(url.replace(/^https?:\/\//, ""));
  el.textContent = parts.join(" · ");
}

function applyCaptureCollapsed() {
  const details = $("captureDetails");
  const toggle = $("captureToggle");
  if (!details || !toggle) return;
  details.hidden = captureCollapsed;
  toggle.setAttribute("aria-expanded", captureCollapsed ? "false" : "true");
}

async function handleSave() {
  setToast("", "");

  const title = $("title").textContent?.trim() || "";
  const url = $("url").textContent?.trim() || "";
  const selectionText = $("selection").textContent || "";
  const note = $("note").value.trim();
  const tags = tagsState;

  if (!title && !url && !selectionText && !note) {
    setToast("当前没有可保存的内容。先在网页上选一段文字试试。", "bad");
    return;
  }

  const items = await readAll();
  if (url) {
    const dupCount = items.filter((x) => x.url === url).length;
    if (dupCount > 0) {
      const ok = confirm(`这条链接你已经保存过 ${dupCount} 次了。\n\n要继续保存一条新的灵感吗？`);
      if (!ok) {
        setToast("已取消保存。", "good");
        return;
      }
    }
  }

  const item = {
    id: miniId(),
    createdAt: nowIso(),
    title,
    url,
    selectionText,
    note,
    tags,
    source: "popup",
    version: 1,
  };

  items.unshift(item);
  await writeAll(items);

  lastSavedId = item.id;
  setToast("已保存，已为你定位到最近保存。", "good");
  $("note").value = "";
  $("tagInput").value = "";
  renderTagChips(tags);
  await refreshRecent();

  const recentSection = $("recentSection");
  recentSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleClearInput() {
  $("note").value = "";
  $("tagInput").value = "";
  setTags([]);
  setToast("已清空输入。", "good");
}

function wireEvents() {
  const saveBtn = on("saveBtn", "click", handleSave);
  const clearBtn = on("clearBtn", "click", handleClearInput);
  if (!saveBtn || !clearBtn) {
    setToast("界面文件似乎没有更新完整：请到扩展页面点“刷新”再试。", "bad");
    return;
  }

  const tagInput = $("tagInput");
  if (!tagInput) {
    setToast("标签输入框缺失：请到扩展页面点“刷新”再试。", "bad");
    return;
  }

  tagInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addTagsFromText(tagInput.value);
    tagInput.value = "";
  });

  tagInput.addEventListener("input", () => {
    const v = tagInput.value;
    if (!/[,，\n\r]/.test(v)) return;
    const parts = v.split(/[,，\n\r]+/g);
    const rest = parts.pop() || "";
    addTagsFromText(parts.join(","));
    tagInput.value = rest;
  });

  tagInput.addEventListener("blur", () => {
    addTagsFromText(tagInput.value);
    tagInput.value = "";
  });

  on("captureToggle", "click", async () => {
    captureCollapsed = !captureCollapsed;
    applyCaptureCollapsed();
    await writeUiState();
  });

  on("exportJsonBtn", "click", async () => {
    try {
      await exportAll("json");
      setToast("已生成导出文件。", "good");
    } catch (e) {
      setToast("导出失败：请重试。", "bad");
    }
  });
  on("exportJsonlBtn", "click", async () => {
    try {
      await exportAll("jsonl");
      setToast("已生成导出文件。", "good");
    } catch (e) {
      setToast("导出失败：请重试。", "bad");
    }
  });

  on("exportCsvBtn", "click", async () => {
    try {
      await exportAll("csv");
      setToast("已生成导出文件。", "good");
    } catch (e) {
      setToast("导出失败：请重试。", "bad");
    }
  });

  on("exportExcelBtn", "click", async () => {
    try {
      await exportAll("excel");
      setToast("已生成导出文件（Excel 兼容）。", "good");
    } catch (e) {
      setToast("导出失败：请重试。", "bad");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  wireEvents();
  await readUiState();
  applyCaptureCollapsed();
  await initPageContext();
  setTags([]);
  await refreshRecent();
});

