// Public embed script: popup, slide-in, side tab and chat-style popover for any form.
//   <script src="https://YOUR-SITE/embed.js" data-form="my-form" data-mode="popup" data-label="Apply now" async></script>
// The slug is validated and every value is set with textContent / property assignment (no innerHTML).

export const dynamic = "force-static";

const JS = String.raw`(function () {
  var s = document.currentScript;
  if (!s) return;
  var slug = (s.getAttribute("data-form") || "").toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return;
  var origin = new URL(s.src).origin;
  var mode = s.getAttribute("data-mode") || "popup";
  var label = s.getAttribute("data-label") || "Apply now";
  var color = /^#[0-9a-fA-F]{6}$/.test(s.getAttribute("data-color") || "") ? s.getAttribute("data-color") : "#0445AF";
  var url = origin + "/apply/" + slug;

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
  }
  function frame() {
    var f = document.createElement("iframe");
    f.src = url;
    f.title = "Form";
    f.allow = "clipboard-write";
    f.style.cssText = "width:100%;height:100%;border:0;background:#fff";
    return f;
  }
  var layer = null;
  function close() { if (layer) { layer.remove(); layer = null; document.removeEventListener("keydown", onKey); } }
  function onKey(e) { if (e.key === "Escape") close(); }
  function open(kind) {
    close();
    var back = el("div", "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);display:flex;" +
      (kind === "slider" ? "justify-content:flex-end;" : "align-items:center;justify-content:center;"));
    var box = el("div", kind === "slider"
      ? "width:min(520px,100%);height:100%;background:#fff;position:relative;box-shadow:-8px 0 30px rgba(0,0,0,.2)"
      : kind === "popover"
        ? "position:absolute;right:20px;bottom:90px;width:min(390px,calc(100% - 40px));height:min(600px,calc(100% - 120px));background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.3)"
        : "width:min(1000px,94%);height:min(88vh,100%);background:#fff;border-radius:12px;overflow:hidden;position:relative");
    if (kind === "popover") back.style.background = "transparent";
    var x = el("button", "position:absolute;top:8px;right:10px;z-index:2;border:0;background:rgba(0,0,0,.55);color:#fff;width:30px;height:30px;border-radius:15px;font-size:18px;line-height:1;cursor:pointer", "×");
    x.setAttribute("aria-label", "Close");
    x.onclick = close;
    back.onclick = function (e) { if (e.target === back) close(); };
    box.appendChild(frame());
    box.appendChild(x);
    back.appendChild(box);
    document.body.appendChild(back);
    layer = back;
    document.addEventListener("keydown", onKey);
  }
  function button(css) {
    var b = el("button", "font:500 16px system-ui,sans-serif;cursor:pointer;border:0;color:#fff;background:" + color + ";" + css, label);
    return b;
  }

  if (mode === "popup" || mode === "slider") {
    var b = button("padding:10px 20px;border-radius:6px");
    b.onclick = function () { open(mode); };
    s.parentNode.insertBefore(b, s);
  } else if (mode === "sidetab") {
    var t = button("position:fixed;right:0;top:50%;transform:translateY(-50%) rotate(-90deg);transform-origin:100% 100%;padding:10px 18px;border-radius:8px 8px 0 0;z-index:2147482000");
    t.onclick = function () { open("slider"); };
    document.body.appendChild(t);
  } else if (mode === "popover") {
    var p = button("position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:28px;font-size:24px;z-index:2147482000;box-shadow:0 6px 20px rgba(0,0,0,.3)");
    p.textContent = "✉";
    p.setAttribute("aria-label", label);
    p.onclick = function () { layer ? close() : open("popover"); };
    document.body.appendChild(p);
  } else if (mode === "fullpage") {
    var f = frame();
    f.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147482000;background:#fff";
    document.body.appendChild(f);
  }
  window.TawakkulForm = { open: function (m) { open(m || "popup"); }, close: close };
})();
`;

export function GET() {
  return new Response(JS, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}
