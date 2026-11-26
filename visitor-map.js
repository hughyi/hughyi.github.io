/*
 * Minimal dotted visitor map.
 *
 * Usage: <div id="visitor-map" data-endpoint="https://<your-worker>.workers.dev"></div>
 * Each browser is counted once (localStorage flag); every view fetches the
 * aggregated points. Without an endpoint, only the land dots are drawn.
 */
(function () {
  "use strict";

  // Land mask: 2° equirectangular grid, 180 cols x 69 rows, lat 80°N → 56°S,
  // generated from Natural Earth 110m land (world-atlas@2.0.2). 1 bit per cell.
  var GRID = {
    step: 2,
    cols: 180,
    rows: 69,
    latTop: 80,
    land: "AAAAAAA//v///8AB/wBwAADwAAAAAAAAAAA2f//////4AA9AAAAAAOAAAAAAAAAAB/m/4f///wAAAAAD+AH/4APgAAAAAAD03/4Af//wAAAAAHAD///cDAAAgAAAH/33/AP//gAAAAAMD////+/8AAAP/7/f///4P//gAAH+AA3////////ew///////38H/8AAAf/6///////////+///////h+H/g+AA//////////////GX/////938D8AeAD//////////////Af/////wnYB4AAAP7/////////////Af9////gH0AYAAAP5///////////PwABwH///wH+AAAAGH5/////////+A8AAOAA///+H/AAAAGDz/////////4B8AAQAB////v/wAAAbH///////////A4AAAAAP/////4AAAfv///////////AgAAAAAP/////YAAAH////////////AAAAAAAD////88AAAH///////////9AAAAAAAD/////AAAAB///////////5AAAAAAAD////0AAAAN//4f///////zgAAAAAAD////gAAAAfz3zv///////DAAAAAAAD///+AAAAAfiff///////+CAAAAAAAD///+AAAAAfAzf///////uGAAAAAAAB///8AAAAAF/BO///////m+AAAAAAAA///8AAAAAP/AB///////l4AAAAAAAAf//wAAAAAf/z1///////hAAAAAAAAAP//wAAAAAf//////////gAAAAAAAAAP/AwAAAAB///////////gAAAAAAAAAH/AYAAAAD/////z/////AAAAAAAAAAC+AAAAAAD//////H////gAAAAAAAAAAfA8AAAAH//////B///8gAAAAAAgAAAfOHgAAAD////v/A/z/wAAAAAAAAAAAP8F4AAAD/////+A/B/ggAAAAAAAAAAD/AAAAAH////34A+B/ggAAAAAAAAAAAPgAAAAH/////gAcAfgwAAAAAAAAAAADhAAAAH////8wAcAXgYAAAAAAAAAAABr/AAAD/////wAOATBYAAAAAAAAAAAA3/gAAB/////gAKAQAcAAAAAAAAAAAAH/8AAA/////gACAMDIAAAAAAAAAAAAH/+AAAIH///AAAA8PAAAAAAAAAAAAAP/+AAAAD//+AAAAc+CAAAAAAAAAAAAP//AAAAD//8AAAAc+ygAAAAAAAAAAAf//4AAAD//4AAAAOfhsAAAAAAAAAAAf//+AAAB//wAAAAGF1/iAAAAAAAAAAf///gAAA//wAAAADgQX9AAAAAAAAAAP///gAAA//wAAAAB/0HwQAAAAAAAAAP///AAAA//wAAAAABIAcIAAAAAAAAAH///AAAA//4gAAAAAB5AAAAAAAAAAAD//+AAAA//4gAAAAAHxgAAAAAAAAAAD//+AAAA//zgAAAAAP7gBBAAAAAAAAA//+AAAA//jgAAAAAf/gABAAAAAAAAAf/8AAAA//DgAAAAB//4CAAAAAAAAAAf/8AAAAf/HAAAAAH//4CAAAAAAAAAA//wAAAAf/DAAAAAP//8AAAAAAAAAAA//AAAAAf+CAAAAAP//+AAAAAAAAAAA//AAAAAf+AAAAAAH//+AAAAAAAAAAA/+AAAAAP8AAAAAAH//+AAAAAAAAAAA/+AAAAAH4AAAAAAD//+AAAAAAAAAAA/8AAAAAHwAAAAAAHwf8AAAAAAAAAAB/wAAAAAAAAAAAAAAAH4AMAAAAAAAAB/wAAAAAAAAAAAAAAAD4AGAAAAAAAAB+AAAAAAAAAAAAAAAAAAAGAAAAAAAAB+AAAAAAAAAAAAAAAAAwAcAAAAAAAAB8AAAAAAAAAAAAAAAAAQA4AAAAAAAAD4AAAAAAAAAAAAAAAAAABwAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAACAAAAAAAAAAAAAAAAADxgAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA="
  };

  var COLORS = {
    land: "#dfe3e8",
    visitor: "23, 114, 208" // #1772d0, the site's link blue
  };
  var COUNTED_KEY = "visitor-map:counted";

  var root = document.getElementById("visitor-map");
  if (!root) return;

  var landCells = decodeLand(GRID.land);
  var visitors = []; // [{i, j, t}] t = 0..1 intensity
  var you = null; // {i, j}
  var fade = 1;

  root.classList.add("visitor-map");
  var wrap = document.createElement("div");
  wrap.className = "visitor-map__canvas";
  var canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "World map of where visitors to this site come from");
  wrap.appendChild(canvas);
  var youDot = document.createElement("span");
  youDot.className = "visitor-map__you";
  youDot.title = "You are here";
  youDot.hidden = true;
  wrap.appendChild(youDot);
  var caption = document.createElement("p");
  caption.className = "visitor-map__caption";
  root.appendChild(wrap);
  root.appendChild(caption);

  function decodeLand(b64) {
    var bin = atob(b64);
    var cells = [];
    var total = GRID.cols * GRID.rows;
    for (var k = 0; k < total; k++) {
      if ((bin.charCodeAt(k >> 3) >> (7 - (k & 7))) & 1) {
        cells.push(k);
      }
    }
    return cells;
  }

  function toCell(lat, lon) {
    var i = Math.floor((lon + 180) / GRID.step);
    var j = Math.round((GRID.latTop - lat) / GRID.step);
    if (i < 0) i = 0;
    if (i >= GRID.cols) i = GRID.cols - 1;
    if (j < 0 || j >= GRID.rows) return null;
    return { i: i, j: j };
  }

  function draw() {
    var width = wrap.clientWidth;
    if (!width) return;
    var sp = width / GRID.cols;
    var height = sp * GRID.rows;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var r = sp * 0.3;
    ctx.fillStyle = COLORS.land;
    ctx.beginPath();
    for (var n = 0; n < landCells.length; n++) {
      var k = landCells[n];
      var x = ((k % GRID.cols) + 0.5) * sp;
      var y = (Math.floor(k / GRID.cols) + 0.5) * sp;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    for (var m = 0; m < visitors.length; m++) {
      var v = visitors[m];
      ctx.fillStyle = "rgba(" + COLORS.visitor + "," + ((0.55 + 0.45 * v.t) * fade) + ")";
      ctx.beginPath();
      ctx.arc((v.i + 0.5) * sp, (v.j + 0.5) * sp, sp * (0.42 + 0.3 * v.t), 0, Math.PI * 2);
      ctx.fill();
    }

    if (you) {
      youDot.style.left = ((you.i + 0.5) * sp) + "px";
      youDot.style.top = ((you.j + 0.5) * sp) + "px";
      youDot.hidden = false;
    }
  }

  function render(data) {
    var points = data.points || [];
    var max = 1;
    for (var a = 0; a < points.length; a++) max = Math.max(max, points[a][2]);
    visitors = [];
    for (var b = 0; b < points.length; b++) {
      var cell = toCell(points[b][0], points[b][1]);
      if (!cell) continue;
      cell.t = Math.log(1 + points[b][2]) / Math.log(1 + max);
      visitors.push(cell);
    }
    you = data.you ? toCell(data.you.lat, data.you.lon) : null;

    if (data.total) {
      caption.textContent =
        data.total.toLocaleString("en-US") + (data.total === 1 ? " visitor" : " visitors") +
        " \u00b7 " + data.countries + (data.countries === 1 ? " country" : " countries");
    }

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !window.requestAnimationFrame) {
      fade = 1;
      draw();
      return;
    }
    var start = null;
    fade = 0;
    (function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / 700);
      fade = 1 - Math.pow(1 - p, 3);
      draw();
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }

  draw();
  if (window.ResizeObserver) {
    new ResizeObserver(draw).observe(wrap);
  } else {
    window.addEventListener("resize", draw);
  }

  var endpoint = root.getAttribute("data-endpoint");
  if (!endpoint || !window.fetch) return;

  var counted = false;
  try {
    counted = !!localStorage.getItem(COUNTED_KEY);
  } catch (e) {}

  fetch(endpoint, { method: counted ? "GET" : "POST" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!counted) {
        try {
          localStorage.setItem(COUNTED_KEY, String(Date.now()));
        } catch (e) {}
      }
      render(data);
    })
    .catch(function () {
      /* Map stays as plain land dots if the endpoint is unreachable. */
    });
})();
