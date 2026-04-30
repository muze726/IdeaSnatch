const STORAGE_KEY = "inspiration_items_v1";
let lastSavedId = null;

function $(id) {
  return document.getElementById(id);
}

function nowIso() {
  return new Date().toISOString();
}

function miniId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toTags(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function formatTime(iso) {
  const d = new Date(iso);
  const pad = (n) => `${n}`.padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
      const next = toTags(
        $("tags")
          .value.split(",")
          .filter((s) => s.trim() !== t)
          .join(",")
      );
      $("tags").value = next.join(", ");
      renderTagChips(next);
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
  let mime = "application/json";
  let ext = "json";

  if (format === "jsonl") {
    ext = "jsonl";
    mime = "application/x-ndjson";
    content = items.map((x) => JSON.stringify(x)).join("\n") + "\n";
  } else {
    content = JSON.stringify(items, null, 2) + "\n";
  }

  const blob = new Blob([content], { type: mime });
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

    el.appendChild(title);
    el.appendChild(meta);
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
  } catch (e) {
    $("title").textContent = tab.title || "";
    $("url").textContent = tab.url || "";
    $("url").href = tab.url || "#";
    $("selection").textContent = "";
    setToast("这个页面不支持读取选中文本（比如浏览器内置页）。", "bad");
  }
}

async function handleSave() {
  setToast("", "");

  const title = $("title").textContent?.trim() || "";
  const url = $("url").textContent?.trim() || "";
  const selectionText = $("selection").textContent || "";
  const note = $("note").value.trim();
  const tags = toTags($("tags").value);

  if (!title && !url && !selectionText && !note) {
    setToast("当前没有可保存的内容。先在网页上选一段文字试试。", "bad");
    return;
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

  const items = await readAll();
  items.unshift(item);
  await writeAll(items);

  lastSavedId = item.id;
  setToast("已保存，已为你定位到最近保存。", "good");
  $("note").value = "";
  $("tags").value = tags.join(", ");
  renderTagChips(tags);
  await refreshRecent();

  const recentSection = $("recentSection");
  recentSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleClearInput() {
  $("note").value = "";
  $("tags").value = "";
  renderTagChips([]);
  setToast("已清空输入。", "good");
}

function wireEvents() {
  $("saveBtn").addEventListener("click", handleSave);
  $("clearBtn").addEventListener("click", handleClearInput);
  $("tags").addEventListener("input", (e) => renderTagChips(toTags(e.target.value)));

  $("exportJsonBtn").addEventListener("click", async () => {
    try {
      await exportAll("json");
      setToast("已生成导出文件。", "good");
    } catch (e) {
      setToast("导出失败：请重试。", "bad");
    }
  });
  $("exportJsonlBtn").addEventListener("click", async () => {
    try {
      await exportAll("jsonl");
      setToast("已生成导出文件。", "good");
    } catch (e) {
      setToast("导出失败：请重试。", "bad");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  wireEvents();
  await initPageContext();
  renderTagChips(toTags($("tags").value));
  await refreshRecent();
});

