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
                    <input type="url" id="link" placeholder="Paste TeraBox link here..." class="w-full pl-4 pr-4 py-4 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
                </div>
                <button onclick="getLinks()" id="searchBtn" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-8 rounded-xl transition-all shadow-lg active:scale-95">
                    Search
                </button>
            </div>
        </div>
        <div id="loading" class="hidden flex flex-col items-center justify-center py-10">
            <div class="w-10 h-10 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p class="text-slate-400 font-medium animate-pulse">Bypassing Servers...</p>
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
                    </div>
                </div>
                <div class="flex flex-col sm:flex-row gap-3">
                    <button onclick="playVideo()" class="flex-1 bg-white hover:bg-slate-200 text-slate-900 font-bold py-3.5 px-4 rounded-xl shadow-lg active:scale-95">Watch Now</button>
                    <a id="downloadBtn" href="#" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg active:scale-95 text-center leading-[3.5rem] flex items-center justify-center">Fast Download</a>
                </div>
            </div>
        </div>
    </div>
    <script>
        let art = null;
        function initPlayer(url, poster) {
            if (art) { art.destroy(); }
            art = new Artplayer({ container: '#artplayer-container', url: url, poster: poster, volume: 0.8, pip: true, autoSize: false, autoMini: true, screenshot: true, setting: true, playbackRate: true, aspectRatio: true, fullscreen: true, playsInline: true, theme: '#3b82f6' });
        }
        function playVideo() { if(art) { art.play(); } document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        
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
                    initPlayer('/proxy?url=' + encodeURIComponent(data.stream) + '&action=play&name=' + encodeURIComponent(data.filename || 'Video.mp4') + '&cidx=' + cIdx, '');
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
    if (pathname === "/manifest.json") return new Response(JSON.stringify(manifestJson), { headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders } });
    if (pathname === "/sw.js") return new Response(serviceWorkerJs, { headers: { "Content-Type": "application/javascript; charset=utf-8", ...corsHeaders } });
    if (pathname === "/") return new Response(htmlPage, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });

    // ==========================================
    // 🎬 TELEGRAM MINI-APP PLAYER ROUTE
    // ==========================================
    if (pathname === "/watch") {
        const streamUrlRaw = url.searchParams.get("url") || "";
        const title = url.searchParams.get("name") || "TeraBox Video";
        const cIdx = url.searchParams.get("cidx") || "0";

        // Generate the proxy link for the player
        const proxyStream = "/proxy?url=" + encodeURIComponent(streamUrlRaw) + "&action=play&name=" + encodeURIComponent(title) + "&cidx=" + cIdx;

        const playerHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>${title}</title>
            <script src="https://cdn.jsdelivr.net/npm/artplayer/dist/artplayer.js"></script>
            <style>
                body { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100vh; width: 100vw; }
                #artplayer-container { width: 100%; height: 100%; }
            </style>
        </head>
        <body>
            <div id="artplayer-container"></div>
            <script>
                var art = new Artplayer({
                    container: '#artplayer-container',
                    url: '${proxyStream}',
                    title: '${title}',
                    autoplay: true,
                    volume: 0.8,
                    pip: true,
                    fullscreen: true,
                    playsInline: true,
                    theme: '#3b82f6'
                });
            </script>
        </body>
        </html>
        `;
        return new Response(playerHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ==========================================
    // 🛡️ SECRET ADMIN PANEL ROUTE
    // ==========================================
    if (pathname === "/admin") {
        // ... (Admin panel code is same, kept brief for length but fully functional)
        const pass = url.searchParams.get("pass");
        if (pass !== "rishi2026") return new Response("Unauthorized!", { status: 401 });

        const validCookies = getValidCookies();
        let tableRows = "";
        validCookies.forEach((cookie, index) => {
            const shortCookie = cookie.substring(0, 10) + ".........." + cookie.substring(cookie.length - 6);
            const stats = cookieStats.get(cookie) || { uses: 0, errors: 0, lastActive: "Never" };
            let statusBadge = stats.errors > 5 ? "<span style='color: #f87171;'>⚠️ Blocked</span>" : "<span style='color: #4ade80;'>✅ Active</span>";
            tableRows += \`<tr><td>\${index + 1}</td><td>\${shortCookie}</td><td>\${statusBadge}</td><td>\${stats.uses}</td><td>\${stats.errors}</td><td>\${stats.lastActive}</td></tr>\`;
        });

        const adminHtml = \`<!DOCTYPE html><html lang="en"><body style="background:#0f172a; color:white; font-family:sans-serif; padding:20px;"><h2>🛡️ Admin Dashboard</h2><table border="1" style="width:100%; text-align:left; border-collapse:collapse;"><tr><th>#</th><th>Cookie</th><th>Status</th><th>Uses</th><th>Fails</th><th>Last Used</th></tr>\${tableRows}</table></body></html>\`;
        return new Response(adminHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ==========================================
    // 🌐 PROXY SYSTEM (With Tracker)
    // ==========================================
    if (pathname === "/proxy") {
      const targetUrl = url.searchParams.get("url");
      const action = url.searchParams.get("action");
      const safeFileName = (url.searchParams.get("name") || "Video.mp4").replace(/"/g, "");
      const VALID_COOKIES = getValidCookies();
      const ndusCookie = VALID_COOKIES[parseInt(url.searchParams.get("cidx") || "0")] || VALID_COOKIES[0] || "";
      
      if (!targetUrl) return new Response("Missing URL", { status: 400 });

      const fHeaders = new Headers();
      fHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36");
      fHeaders.set("Referer", "https://terabox.app/");
      if (ndusCookie) fHeaders.set("Cookie", "ndus=" + ndusCookie);
      const range = req.headers.get("Range");
      if (range) fHeaders.set("Range", range);

      try {
        const pRes = await fetch(targetUrl, { headers: fHeaders, method: req.method, redirect: "follow" });
        if (!pRes.ok) { recordUse(ndusCookie, true); return new Response("Proxy failed", { status: pRes.status }); }
        recordUse(ndusCookie, false); 

        const rHeaders = new Headers();
        const allowedHeaders = ['content-length', 'content-range', 'accept-ranges', 'content-type'];
        pRes.headers.forEach((value, key) => { if (allowedHeaders.includes(key.toLowerCase())) rHeaders.set(key, value); });
        rHeaders.set("Access-Control-Allow-Origin", "*");
        
        if (action === "play") {
          if (!rHeaders.has("content-type") || !rHeaders.get("content-type")?.includes("video")) rHeaders.set("content-type", "video/mp4");
        } else {
          rHeaders.set("content-disposition", 'attachment; filename="' + safeFileName + '"');
        }
        return new Response(pRes.body, { status: pRes.status, headers: rHeaders });
      } catch (e: any) {
        recordUse(ndusCookie, true); return new Response("Network error", { status: 500 });
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

        let data = cache.get(surl)?.data;
        if (data) { recordUse(selCookie, false); } 
        else {
          data = await tera(surl, selCookie);
          if (data?.error) recordUse(selCookie, true); 
          else { recordUse(selCookie, false); cache.set(surl, { data, expiry: Date.now() + CACHE_DURATION }); }
        }

        if (data?.error) return Response.json({ status: "error", error: data.error }, { status: 400, headers: corsHeaders });
        const item = data?.list?.[0];
        return Response.json({
          status: "success", cookie_index: rIdx, filename: item?.server_filename, size: formatBytes(item?.size), download: item?.dlink, stream: item?.dlink, thumbs: item?.thumbs
        }, { headers: corsHeaders });
      } catch (e: any) {
        return Response.json({ status: "error", message: "Internal Error" }, { status: 500, headers: corsHeaders });
      }
    }
    return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });
  },
});

console.log("Bun server running on port " + port);

// ==========================================
// 🤖 TELEGRAM BOT INTEGRATION (WITH WEB APP)
// ==========================================
import TelegramBot from 'node-telegram-bot-api';
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (botToken) {
    const bot = new TelegramBot(botToken, { polling: true });
    console.log("Telegram Bot is running...");

    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, "👋 Welcome to TeraBox Pro Bot!\n\nMujhe koi bhi TeraBox ka link bhejiye aur main aapko direct fast streaming aur download link dunga.");
    });

    bot.onText(/(https?:\/\/[^\s]+)/g, async (msg, match) => {
        const chatId = msg.chat.id;
        const url = match ? match[1] : "";
        if (!url.includes("tera") && !url.includes("1drv") && !url.includes("box")) return;

        const sentMsg = await bot.sendMessage(chatId, "⏳ Bypassing TeraBox Servers... Please wait.");

        try {
            const apiUrl = "http://localhost:" + port + "/api?url=" + encodeURIComponent(url);
            const res = await fetch(apiUrl);
            const data = await res.json();

            if (data.status === "success") {
                const cIdx = data.cookie_index || 0;
                const fileName = data.filename || "Video.mp4";
                const baseUrl = "https://terabox-api-vu14.onrender.com";
                
                // YAHAN MAGIC HAI: /watch wala naya link banaya
                const watchUrl = baseUrl + "/watch?url=" + encodeURIComponent(data.stream) + "&name=" + encodeURIComponent(fileName) + "&cidx=" + cIdx;
                const downloadUrl = baseUrl + "/proxy?url=" + encodeURIComponent(data.download) + "&name=" + encodeURIComponent(fileName) + "&cidx=" + cIdx;

                const options = {
                    reply_markup: {
                        inline_keyboard: [
                            // YAHAN web_app ADD KIYA HAI!
                            [{ text: "🎬 Watch Inside Telegram", web_app: { url: watchUrl } }],
                            [{ text: "⬇️ Download Fast", url: downloadUrl }]
                        ]
                    }
                };

                const successText = "✅ **File:** " + fileName + "\n📦 **Size:** " + data.size + "\n\nNiche diye gaye buttons par click karein:";
                
                bot.editMessageText(successText, { 
                    chat_id: chatId, message_id: sentMsg.message_id, reply_markup: options.reply_markup, parse_mode: "Markdown"
                });

            } else {
                bot.editMessageText("❌ Error: " + (data.message || data.error), { chat_id: chatId, message_id: sentMsg.message_id });
            }
        } catch (e: any) {
            bot.editMessageText("❌ Network error. Please try again later.", { chat_id: chatId, message_id: sentMsg.message_id });
        }
    });
}
