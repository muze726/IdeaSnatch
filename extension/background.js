function drawIdeaSnatchIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 32x32 design grid for consistent proportions
  const s = size / 32;
  ctx.save();
  ctx.scale(s, s);

  // High-contrast palette (readable at 16px)
  const bgA = "#1f6feb"; // blue
  const bgB = "#12b981"; // green
  const fg = "#ffffff";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Background rounded square to stand out on any toolbar
  ctx.clearRect(0, 0, 32, 32);
  const r = 7.5;
  const x = 2;
  const y = 2;
  const w = 28;
  const h = 28;
  const g = ctx.createLinearGradient(2, 2, 30, 30);
  g.addColorStop(0, bgA);
  g.addColorStop(1, bgB);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();

  // Capture corners (bold)
  ctx.strokeStyle = fg;
  ctx.lineWidth = 2.8;
  const m = 7.0;
  const L = 6.8;

  ctx.beginPath();
  ctx.moveTo(m, m + L);
  ctx.lineTo(m, m);
  ctx.lineTo(m + L, m);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(32 - m - L, m);
  ctx.lineTo(32 - m, m);
  ctx.lineTo(32 - m, m + L);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(32 - m, 32 - m - L);
  ctx.lineTo(32 - m, 32 - m);
  ctx.lineTo(32 - m - L, 32 - m);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(m + L, 32 - m);
  ctx.lineTo(m, 32 - m);
  ctx.lineTo(m, 32 - m - L);
  ctx.stroke();

  // Simple bulb (avoid clutter at small sizes)
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.strokeStyle = fg;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(16, 15, 5.0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Base (single bold line)
  ctx.beginPath();
  ctx.moveTo(13.6, 21.2);
  ctx.lineTo(18.4, 21.2);
  ctx.stroke();

  // Spark accent (bold dot + short ray)
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(22.6, 10.2, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(23.8, 11.4);
  ctx.lineTo(26.2, 9.0);
  ctx.stroke();

  ctx.restore();
  return ctx.getImageData(0, 0, size, size);
}

async function setActionIconFallback() {
  // If static PNG icons exist (manifest default_icon), prefer them and do nothing.
  try {
    const res = await fetch(chrome.runtime.getURL("icons/icon16.png"), { cache: "no-store" });
    if (res.ok) return;
  } catch {
    // continue to fallback
  }

  const icon16 = drawIdeaSnatchIcon(16);
  const icon24 = drawIdeaSnatchIcon(24);
  const icon32 = drawIdeaSnatchIcon(32);
  if (!icon16 || !icon24 || !icon32) return;

  chrome.action.setIcon({
    imageData: {
      16: icon16,
      24: icon24,
      32: icon32,
    },
  });
}

chrome.runtime.onInstalled.addListener(() => void setActionIconFallback());
chrome.runtime.onStartup?.addListener?.(() => void setActionIconFallback());

// In case service worker wakes up for other reasons
void setActionIconFallback();

