import { tera } from "./lib/terabox";
import { isValidShareUrl, extractSurl, formatBytes, loadCookies } from "./lib/utils";

const port = process.env.PORT || 5000;

// ==========================================
// 🔒 SECURE MULTI-COOKIE POOL & TRACKER
// ==========================================
function getValidCookies() {
    const cookiesObj = loadCookies();
    const rawNdus = cookiesObj["ndus"] || "";
    return rawNdus.split(',').map(c => c.trim()).filter(c => c.length > 20);
}

// Ye system cookies ki health track karega
const cookieStats = new Map<string, { uses: number; errors: number; lastActive: string }>();

function recordUse(cookie: string, isError: boolean) {
    if (!cookie) return;
    if (!cookieStats.has(cookie)) {
        cookieStats.set(cookie, { uses: 0, errors: 0, lastActive: "Never" });
    }
    const stats = cookieStats.get(cookie)!;
    if (isError) {
        stats.errors += 1;
    } else {
        stats.uses += 1;
        // Indian Time ke hisaab se update karega
        stats.lastActive = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    }
}

const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_DURATION = 2 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
};

const manifestJson = {
  name: "TeraBox Player Pro",
  short_name: "TeraPlayer",
  description: "Fast Stream & Direct Download TeraBox Videos",
  start_url: "/",
  display: "standalone",
  background_color: "#0f172a",
  theme_color: "#3b82f6",
  icons: [{ src: "https://cdn-icons-png.flaticon.com/512/2985/2985679.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }]
};

const serviceWorkerJs = "self.addEventListener('install', (e) => { self.skipWaiting(); }); self.addEventListener('fetch', (e) => { });";

// ==========================================
// 🎨 FRONTEND HTML (Main User Page)
// ==========================================
const htmlPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>TeraBox Stream & Download</title>
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#0f172a">
    <link rel="apple-touch-icon" href="https://cdn-icons-png.flaticon.com/512/2985/2985679.png">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/artplayer/dist/artplayer.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #0f172a; -webkit-tap-highlight-color: transparent; }
        .glass-card { background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .artplayer-app { width: 100%; aspect-ratio: 16/9; height: auto; max-height: 70vh; border-top-left-radius: 1rem; border-top-right-radius: 1rem; z-index: 10; background-color: #000; }
        .artplayer-video { object-fit: contain !important; }
    </style>
</head>
<body class="text-white min-h-screen flex flex-col items-center py-6 px-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black">
    <div class="max-w-2xl w-full relative z-10">
        <button id="installAppBtn" class="hidden w-full mb-6 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-green-500/30 transition-all active:scale-95 animate-bounce">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Install App to Home Screen
        </button>
        <div class="text-center mb-8">
            <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">TeraBox</span> Player
            </h1>
            <p class="text-slate-400 text-sm md:text-base font-medium">Ultra-Fast Direct CDN Stream. No Ads, No Buffering.</p>
        </div>
        <div id="searchSection" class="glass-card rounded-2xl shadow-2xl p-2 flex flex-col sm:flex-row gap-2 mb-8 relative transition-all">
            <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl blur opacity-20"></div>
            <div class="relative flex w-full flex-col sm:flex-row gap-2 z-10">
                <div class="flex-1 relative">
                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    </div>
                    <input type="url" id="link" placeholder="Paste TeraBox link here..." class="w-full pl-11 pr-4 py-4 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
                </div>
                <button onclick="getLinks()" id="searchBtn" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-8 rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-lg shadow-blue-500/30 active:scale-95">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <span>Search</span>
                </button>
            </div>
        </div>
        <div id="loading" class="hidden flex flex-col items-center justify-center py-10">
            <div class="w-10 h-10 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p class="text-slate-400 font-medium animate-pulse">Bypassing Servers for Max Speed...</p>
        </div>
        <div id="error" class="hidden mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl flex items-center gap-3">
            <p id="errorText" class="text-sm font-medium"></p>
        </div>
        <div id="resultCard" class="hidden glass-card rounded-2xl shadow-2xl flex flex-col transform transition-all">
            <div id="artplayer-container" class="artplayer-app bg-black"></div>
            <div class="p-5 sm:p-6 relative">
                <div class="mb-5">
                    <h3 id="filename" class="text-lg md:text-xl font-bold text-white line-clamp-2 leading-tight"></h3>
                    <div class="flex items-center gap-3 mt-2 text-sm text-slate-400 font-medium">
                        <span id="size" class="bg-slate-800 px-2 py-1 rounded-md text-blue-400"></span>
                        <span class="flex items-center gap-1"><svg class="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>Direct CDN Fast</span>
                    </div>
                </div>
                <div class="flex flex-col sm:flex-row gap-3">
                    <button onclick="playVideo()" class="flex-1 bg-white hover:bg-slate-200 text-slate-900 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                        Watch Now
                    </button>
                    <a id="downloadBtn" href="#" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 active:scale-95">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Fast Download
                    </a>
                </div>
                <button onclick="resetUI()" class="w-full mt-4 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    Paste Another Link
                </button>
            </div>
        </div>
    </div>
    <script>
        if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }
        let deferredPrompt;
        const installBtn = document.getElementById('installAppBtn');
        window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installBtn.classList.remove('hidden'); });
        installBtn.addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; installBtn.classList.add('hidden'); } });
        
        let art = null;
        function initPlayer(url, poster) {
            if (art) { art.destroy(); }
            art = new Artplayer({ container: '#artplayer-container', url: url, poster: poster, volume: 0.8, pip: true, autoSize: false, autoMini: true, screenshot: true, setting: true, playbackRate: true, aspectRatio: true, fullscreen: true, playsInline: true, theme: '#3b82f6' });
        }
        function playVideo() { if(art) { art.play(); } document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        function resetUI() { if(art) { art.destroy(); art = null; } document.getElementById('link').value = ''; document.getElementById('resultCard').classList.add('hidden'); document.getElementById('searchSection').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        
        async function getLinks() {
            const link = document.getElementById('link').value.trim();
            if(!link) return;
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('resultCard').classList.add('hidden');
            document.getElementById('error').classList.add('hidden');
            const btn = document.getElementById('searchBtn');
            btn.disabled = true;
            btn.innerHTML = '...';
            try {
                const res = await fetch('/api?url=' + encodeURIComponent(link));
                const data = await res.json();
                document.getElementById('loading').classList.add('hidden');
                btn.disabled = false;
                btn.innerHTML = 'Search';
                
                if(data.status === 'success') {
                    document.getElementById('resultCard').classList.remove('hidden');
                    document.getElementById('filename').innerText = data.filename || 'Video.mp4';
                    document.getElementById('size').innerText = data.size || 'N/A';
                    const cIdx = data.cookie_index || 0;
                    document.getElementById('downloadBtn').href = '/proxy?url=' + encodeURIComponent(data.download) + '&name=' + encodeURIComponent(data.filename || 'Video.mp4') + '&cidx=' + cIdx;
                    const posterUrl = data.thumbs ? (data.thumbs.url3 || data.thumbs.url2 || data.thumbs.url1) : '';
                    initPlayer('/proxy?url=' + encodeURIComponent(data.stream) + '&action=play&name=' + encodeURIComponent(data.filename || 'Video.mp4') + '&cidx=' + cIdx, posterUrl);
                } else {
                    document.getElementById('errorText').innerText = data.error || data.message || 'Error fetching link';
                    document.getElementById('error').classList.remove('hidden');
                }
            } catch(e) { 
                document.getElementById('loading').classList.add('hidden');
                btn.disabled = false;
                btn.innerHTML = 'Search';
                document.getElementById('errorText').innerText = 'Network Error';
                document.getElementById('error').classList.remove('hidden');
            }
        }
    </script>
</body>
</html>
`;

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (pathname === "/manifest.json") return new Response(JSON.stringify(manifestJson), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    if (pathname === "/sw.js") return new Response(serviceWorkerJs, { headers: { "Content-Type": "application/javascript", ...corsHeaders } });
    if (pathname === "/") return new Response(htmlPage, { headers: { "Content-Type": "text/html", ...corsHeaders } });

    // ==========================================
    // 🛡️ SECRET ADMIN PANEL ROUTE
    // ==========================================
    if (pathname === "/admin") {
        const pass = url.searchParams.get("pass");
        // Aapka secret password "rishi2026" hai
        if (pass !== "rishi2026") {
            return new Response("Unauthorized! Password galat hai.", { status: 401 });
        }

        const validCookies = getValidCookies();
        let tableRows = "";

        validCookies.forEach((cookie, index) => {
            const shortCookie = cookie.substring(0, 10) + ".........." + cookie.substring(cookie.length - 6);
            const stats = cookieStats.get(cookie) || { uses: 0, errors: 0, lastActive: "Never" };
            
            let statusBadge = "<span style='color: #4ade80; font-weight: bold;'>✅ Active</span>";
            // Agar ek cookie ne lagatar 5 se zyada error diye hain, toh usko block maan liya jayega
            if (stats.errors > 5) {
                statusBadge = "<span style='color: #f87171; font-weight: bold;'>⚠️ Blocked/Expired</span>";
            }

            tableRows += "<tr style='border-bottom: 1px solid #334155;'>";
            tableRows += "<td style='padding:12px;'>" + (index + 1) + "</td>";
            tableRows += "<td style='padding:12px; font-family:monospace; color:#94a3b8;'>" + shortCookie + "</td>";
            tableRows += "<td style='padding:12px;'>" + statusBadge + "</td>";
            tableRows += "<td style='padding:12px; color:#38bdf8; font-weight:bold;'>" + stats.uses + "</td>";
            tableRows += "<td style='padding:12px; color:#f87171; font-weight:bold;'>" + stats.errors + "</td>";
            tableRows += "<td style='padding:12px; font-size:14px;'>" + stats.lastActive + "</td>";
            tableRows += "</tr>";
        });

        const adminHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Dashboard - TeraBox Pro</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="background-color: #0f172a; color: white; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px;">
            <div style="max-width: 900px; margin: 0 auto;">
                <h1 style="color: #3b82f6; border-bottom: 2px solid #1e293b; padding-bottom: 10px;">🛡️ Secret Admin Dashboard</h1>
                <p style="color: #cbd5e1; font-size: 16px;">Yahan aap check kar sakte hain ki aapki kaunsi cookie theek kaam kar rahi hai aur kaunsi fail ho gayi.</p>
                
                <div style="background: #1e293b; border-radius: 10px; overflow: hidden; margin-top: 25px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background: #0f172a;">
                                <th style="padding:15px; color:#64748b;">#</th>
                                <th style="padding:15px; color:#64748b;">Secure Cookie</th>
                                <th style="padding:15px; color:#64748b;">Status</th>
                                <th style="padding:15px; color:#64748b;">Successful Uses</th>
                                <th style="padding:15px; color:#64748b;">Fails/Errors</th>
                                <th style="padding:15px; color:#64748b;">Last Used At</th>
                            </tr>
                        </thead>
                        <tbody>
                            ` + tableRows + `
                        </tbody>
                    </table>
                </div>
                <p style="margin-top:20px; color:#94a3b8; font-size:14px; background: #1e293b; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <strong>Note:</strong> Render ka free server jab sleep hoke dobara start hota hai, tab ye Fails aur Uses zero (0) se reset ho jate hain. Isliye ye aapko hamesha fresh live data dikhayega!
                </p>
            </div>
        </body>
        </html>
        `;

        return new Response(adminHtml, { headers: { "Content-Type": "text/html" } });
    }

    // ==========================================
    // 🌐 PROXY SYSTEM (With Tracker)
    // ==========================================
    if (pathname === "/proxy") {
      const targetUrl = url.searchParams.get("url");
      const action = url.searchParams.get("action");
      const safeFileName = (url.searchParams.get("name") || "Video.mp4").replace(/"/g, "");
      
      const VALID_COOKIES = getValidCookies();
      const cIdx = parseInt(url.searchParams.get("cidx") || "0");
      const ndusCookie = VALID_COOKIES[cIdx] || VALID_COOKIES[0] || "";
      
      if (!targetUrl) return new Response("Missing URL", { status: 400 });

      const fHeaders = new Headers();
      fHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36");
      fHeaders.set("Referer", "https://terabox.app/");
      if (ndusCookie) fHeaders.set("Cookie", "ndus=" + ndusCookie);
      
      const range = req.headers.get("Range");
      if (range) fHeaders.set("Range", range);

      try {
        const pRes = await fetch(targetUrl, { headers: fHeaders, method: req.method, redirect: "follow" });
        
        if (!pRes.ok) {
           recordUse(ndusCookie, true); // Tracker: Error
           return new Response("Proxy failed with status: " + pRes.status, { status: pRes.status });
        }

        recordUse(ndusCookie, false); // Tracker: Success

        const rHeaders = new Headers();
        const allowedHeaders = ['content-length', 'content-range', 'accept-ranges', 'content-type'];
        pRes.headers.forEach((value, key) => {
          if (allowedHeaders.includes(key.toLowerCase())) {
            rHeaders.set(key, value);
          }
        });
        rHeaders.set("Access-Control-Allow-Origin", "*");
        
        if (action === "play") {
          if (!rHeaders.has("content-type") || !rHeaders.get("content-type")?.includes("video")) {
            rHeaders.set("content-type", "video/mp4");
          }
        } else {
          rHeaders.set("content-disposition", 'attachment; filename="' + safeFileName + '"');
        }

        return new Response(pRes.body, { status: pRes.status, headers: rHeaders });
      } catch (e: any) {
        recordUse(ndusCookie, true); // Tracker: Network Error
        return new Response("Proxy failed due to network error: " + String(e.message), { status: 500 });
      }
    }

    // ==========================================
    // 🚀 API ROUTE (With Tracker)
    // ==========================================
    if (pathname === "/api") {
      try {
        const tUrlRaw = url.searchParams.get("url");
        if (!tUrlRaw || !isValidShareUrl(tUrlRaw)) return Response.json({ status: "error", message: "Invalid URL" }, { status: 400, headers: corsHeaders });

        const surl = extractSurl(tUrlRaw);
        if (!surl) return Response.json({ status: "error", message: "Invalid SURL" }, { status: 400, headers: corsHeaders });

        const VALID_COOKIES = getValidCookies();
        const rIdx = VALID_COOKIES.length > 0 ? Math.floor(Math.random() * VALID_COOKIES.length) : 0;
        const selCookie = VALID_COOKIES[rIdx] || "";

        let data;
        const cached = cache.get(surl);
        if (cached && Date.now() < cached.expiry) {
          data = cached.data;
          recordUse(selCookie, false); // Tracker: Success from Cache
        } else {
          data = await tera(surl, selCookie);
          if (data?.error) {
              recordUse(selCookie, true); // Tracker: Error from API
          } else {
              recordUse(selCookie, false); // Tracker: Success from API
              cache.set(surl, { data, expiry: Date.now() + CACHE_DURATION });
          }
        }

        if (data?.error) return Response.json({ status: "error", error: data.error }, { status: 400, headers: corsHeaders });

        const item = data?.list?.[0];
        return Response.json({
          status: "success",
          cookie_index: rIdx,
          filename: item?.server_filename,
          size: formatBytes(item?.size),
          download: item?.dlink,
          stream: item?.dlink,
          thumbs: item?.thumbs
        }, { headers: corsHeaders });
      } catch (e: any) {
        return Response.json({ status: "error", message: "Internal Error" }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });
  },
});

console.log("Bun server running on port " + port);
