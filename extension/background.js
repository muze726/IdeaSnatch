function drawIdeaSnatchIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // transparent background
  ctx.clearRect(0, 0, size, size);

  // Use a 32x32 design grid for consistent proportions
  const s = size / 32;
  ctx.save();
  ctx.scale(s, s);

  const blue = "rgba(147, 197, 253, 0.96)";
  const green = "rgba(52, 211, 153, 0.92)";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Capture frame corners (idea "snatch" / "capture")
  ctx.strokeStyle = blue;
  ctx.lineWidth = 2.4;

  const m = 5.5;
  const L = 7.5;

  // top-left
  ctx.beginPath();
  ctx.moveTo(m, m + L);
  ctx.lineTo(m, m);
  ctx.lineTo(m + L, m);
  ctx.stroke();
  // top-right
  ctx.beginPath();
  ctx.moveTo(32 - m - L, m);
  ctx.lineTo(32 - m, m);
  ctx.lineTo(32 - m, m + L);
  ctx.stroke();
  // bottom-right
  ctx.beginPath();
  ctx.moveTo(32 - m, 32 - m - L);
  ctx.lineTo(32 - m, 32 - m);
  ctx.lineTo(32 - m - L, 32 - m);
  ctx.stroke();
  // bottom-left
  ctx.beginPath();
  ctx.moveTo(m + L, 32 - m);
  ctx.lineTo(m, 32 - m);
  ctx.lineTo(m, 32 - m - L);
  ctx.stroke();

  // Light bulb (the "idea")
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.fillStyle = "rgba(255,255,255,0.06)";

  // bulb head
  ctx.beginPath();
  ctx.arc(16, 14, 6.0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // filament
  ctx.strokeStyle = "rgba(255,255,255,0.70)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(13.2, 14.2);
  ctx.quadraticCurveTo(16, 12.4, 18.8, 14.2);
  ctx.stroke();

  // bulb base
  ctx.strokeStyle = "rgba(255,255,255,0.86)";
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(13.8, 20.2);
  ctx.lineTo(18.2, 20.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14.6, 22.4);
  ctx.lineTo(17.4, 22.4);
  ctx.stroke();

  // spark accent (subtle)
  ctx.strokeStyle = green;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(21.8, 9.2);
  ctx.lineTo(24.2, 6.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(23.6, 10.8);
  ctx.lineTo(26.6, 10.8);
  ctx.stroke();

  ctx.restore();

  return ctx.getImageData(0, 0, size, size);
}

function setActionIcon() {
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

chrome.runtime.onInstalled.addListener(() => setActionIcon());
chrome.runtime.onStartup?.addListener?.(() => setActionIcon());

// In case service worker wakes up for other reasons
setActionIcon();

