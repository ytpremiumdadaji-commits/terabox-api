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
const htmlPage = "<!DOCTYPE html>\n" +
"<html lang='en'>\n" +
"<head>\n" +
"    <meta charset='UTF-8'>\n" +
"    <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>\n" +
"    <title>TeraBox Stream & Download</title>\n" +
"    <link rel='manifest' href='/manifest.json'>\n" +
"    <meta name='theme-color' content='#0f172a'>\n" +
"    <script src='https://cdn.tailwindcss.com'></script>\n" +
"    <script src='https://cdn.jsdelivr.net/npm/artplayer/dist/artplayer.js'></script>\n" +
"    <style>\n" +
"        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');\n" +
"        body { font-family: 'Inter', sans-serif; background-color: #0f172a; -webkit-tap-highlight-color: transparent; }\n" +
"        .glass-card { background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); }\n" +
"        .artplayer-app { width: 100%; aspect-ratio: 16/9; height: auto; max-height: 70vh; border-top-left-radius: 1rem; border-top-right-radius: 1rem; z-index: 10; background-color: #000; }\n" +
"        .artplayer-video { object-fit: contain !important; }\n" +
"    </style>\n" +
"</head>\n" +
"<body class='text-white min-h-screen flex flex-col items-center py-6 px-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black'>\n" +
"    <div class='max-w-2xl w-full relative z-10'>\n" +
"        <div class='text-center mb-8'>\n" +
"            <h1 class='text-4xl md:text-5xl font-extrabold tracking-tight mb-2'>\n" +
"                <span class='text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500'>TeraBox</span> Player\n" +
"            </h1>\n" +
"            <p class='text-slate-400 text-sm md:text-base font-medium'>Ultra-Fast Direct CDN Stream. No Ads.</p>\n" +
"        </div>\n" +
"        <div id='searchSection' class='glass-card rounded-2xl shadow-2xl p-2 flex flex-col sm:flex-row gap-2 mb-8 relative transition-all'>\n" +
"            <div class='absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl blur opacity-20'></div>\n" +
"            <div class='relative flex w-full flex-col sm:flex-row gap-2 z-10'>\n" +
"                <div class='flex-1 relative'>\n" +
"                    <input type='url' id='link' placeholder='Paste TeraBox link here...' class='w-full pl-4 pr-4 py-4 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all'>\n" +
"                </div>\n" +
"                <button onclick='getLinks()' id='searchBtn' class='bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-8 rounded-xl transition-all shadow-lg active:scale-95'>\n" +
"                    Search\n" +
"                </button>\n" +
"            </div>\n" +
"        </div>\n" +
"        <div id='loading' class='hidden flex flex-col items-center justify-center py-10'>\n" +
"            <div class='w-10 h-10 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4'></div>\n" +
"            <p class='text-slate-400 font-medium animate-pulse'>Bypassing Servers...</p>\n" +
"        </div>\n" +
"        <div id='error' class='hidden mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl flex items-center gap-3'>\n" +
"            <p id='errorText' class='text-sm font-medium'></p>\n" +
"        </div>\n" +
"        <div id='resultCard' class='hidden glass-card rounded-2xl shadow-2xl flex flex-col transform transition-all'>\n" +
"            <div id='artplayer-container' class='artplayer-app bg-black'></div>\n" +
"            <div class='p-5 sm:p-6 relative'>\n" +
"                <div class='mb-5'>\n" +
"                    <h3 id='filename' class='text-lg md:text-xl font-bold text-white line-clamp-2 leading-tight'></h3>\n" +
"                    <div class='flex items-center gap-3 mt-2 text-sm text-slate-400 font-medium'>\n" +
"                        <span id='size' class='bg-slate-800 px-2 py-1 rounded-md text-blue-400'></span>\n" +
"                    </div>\n" +
"                </div>\n" +
"                <div class='flex flex-col sm:flex-row gap-3'>\n" +
"                    <button onclick='playVideo()' class='flex-1 bg-white hover:bg-slate-200 text-slate-900 font-bold py-3.5 px-4 rounded-xl shadow-lg active:scale-95'>Watch Now</button>\n" +
"                    <a id='downloadBtn' href='#' class='flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg active:scale-95 text-center leading-[3.5rem] flex items-center justify-center'>Fast Download</a>\n" +
"                </div>\n" +
"            </div>\n" +
"        </div>\n" +
"    </div>\n" +
"    <script>\n" +
"        let art = null;\n" +
"        function initPlayer(url, poster) {\n" +
"            if (art) { art.destroy(); }\n" +
"            art = new Artplayer({ container: '#artplayer-container', url: url, poster: poster, volume: 0.8, pip: true, autoSize: false, autoMini: true, screenshot: true, setting: true, playbackRate: true, aspectRatio: true, fullscreen: true, playsInline: true, theme: '#3b82f6' });\n" +
"        }\n" +
"        function playVideo() { if(art) { art.play(); } document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'center' }); }\n" +
"        \n" +
"        async function getLinks() {\n" +
"            const link = document.getElementById('link').value.trim();\n" +
"            if(!link) return;\n" +
"            document.getElementById('loading').classList.remove('hidden');\n" +
"            document.getElementById('resultCard').classList.add('hidden');\n" +
"            document.getElementById('error').classList.add('hidden');\n" +
"            const btn = document.getElementById('searchBtn');\n" +
"            btn.disabled = true; btn.innerHTML = '...';\n" +
"            try {\n" +
"                const res = await fetch('/api?url=' + encodeURIComponent(link));\n" +
"                const data = await res.json();\n" +
"                document.getElementById('loading').classList.add('hidden');\n" +
"                btn.disabled = false; btn.innerHTML = 'Search';\n" +
"                \n" +
"                if(data.status === 'success') {\n" +
"                    document.getElementById('resultCard').classList.remove('hidden');\n" +
"                    document.getElementById('filename').innerText = data.filename || 'Video.mp4';\n" +
"                    document.getElementById('size').innerText = data.size || 'N/A';\n" +
"                    const cIdx = data.cookie_index || 0;\n" +
"                    document.getElementById('downloadBtn').href = '/proxy?url=' + encodeURIComponent(data.download) + '&name=' + encodeURIComponent(data.filename || 'Video.mp4') + '&cidx=' + cIdx;\n" +
"                    initPlayer('/proxy?url=' + encodeURIComponent(data.stream) + '&action=play&name=' + encodeURIComponent(data.filename || 'Video.mp4') + '&cidx=' + cIdx, '');\n" +
"                } else {\n" +
"                    document.getElementById('errorText').innerText = data.error || data.message || 'Error fetching link';\n" +
"                    document.getElementById('error').classList.remove('hidden');\n" +
"                }\n" +
"            } catch(e) { \n" +
"                document.getElementById('loading').classList.add('hidden');\n" +
"                btn.disabled = false; btn.innerHTML = 'Search';\n" +
"                document.getElementById('errorText').innerText = 'Network Error';\n" +
"                document.getElementById('error').classList.remove('hidden');\n" +
"            }\n" +
"        }\n" +
"    </script>\n" +
"</body>\n" +
"</html>";

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
    // 🛡️ SECRET ADMIN PANEL ROUTE
    // ==========================================
    if (pathname === "/admin") {
        const pass = url.searchParams.get("pass");
        if (pass !== "rishi2026") return new Response("Unauthorized!", { status: 401 });

        const validCookies = getValidCookies();
        let tableRows = "";
        
        validCookies.forEach((cookie, index) => {
            const shortCookie = cookie.substring(0, 10) + ".........." + cookie.substring(cookie.length - 6);
            const stats = cookieStats.get(cookie) || { uses: 0, errors: 0, lastActive: "Never" };
            let statusBadge = stats.errors > 5 ? "<span style='color: #f87171;'>⚠️ Blocked</span>" : "<span style='color: #4ade80;'>✅ Active</span>";
            
            tableRows += "<tr><td style='padding:12px; border-bottom:1px solid #334155;'>" + (index + 1) + "</td>" +
                         "<td style='padding:12px; border-bottom:1px solid #334155; color:#94a3b8; font-family:monospace;'>" + shortCookie + "</td>" +
                         "<td style='padding:12px; border-bottom:1px solid #334155;'>" + statusBadge + "</td>" +
                         "<td style='padding:12px; border-bottom:1px solid #334155; color:#38bdf8; font-weight:bold;'>" + stats.uses + "</td>" +
                         "<td style='padding:12px; border-bottom:1px solid #334155; color:#f87171; font-weight:bold;'>" + stats.errors + "</td>" +
                         "<td style='padding:12px; border-bottom:1px solid #334155;'>" + stats.lastActive + "</td></tr>";
        });

        const adminHtml = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>Admin Dashboard</title></head><body style='background:#0f172a; color:white; font-family:sans-serif; padding:20px;'><div style='max-width:900px; margin:0 auto;'><h2>🛡️ Admin Dashboard</h2><table style='width:100%; text-align:left; border-collapse:collapse; background:#1e293b; border-radius:10px; overflow:hidden;'><tr style='background:#020617;'><th>#</th><th>Cookie</th><th>Status</th><th>Uses</th><th>Fails</th><th>Last Used</th></tr>" + tableRows + "</table></div></body></html>";
        return new Response(adminHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ==========================================
    // 🌐 PROXY SYSTEM
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
    // 🚀 API ROUTE
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
// 🤖 TELEGRAM BOT INTEGRATION (PREMIUM MINI-APP MODE)
// ==========================================
import TelegramBot from 'node-telegram-bot-api';
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (botToken) {
    const bot = new TelegramBot(botToken, { polling: true });
    console.log("Telegram Bot is running in Premium Web App Mode...");

    // Function to send the big launch button
    const sendAppButton = (chatId: number) => {
        const welcomeMsg = "🎥 **Welcome to TeraBox Video Player!** 🎬\n\nWatch your Terabox Video directly on Telegram without any ads.\n\nPlease input your Terabox link after clicking the Open Button.\n\n👇 Click the button below to get started!";
        
        // Aapki render wali website ka main URL jahan player laga hai
        const webAppUrl = "https://terabox-api-vu14.onrender.com/";
        
        const options = {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 Open TeraBox Video Player", web_app: { url: webAppUrl } }]
                ]
            }
        };
        bot.sendMessage(chatId, welcomeMsg, options as any);
    };

    // Jab koi /start bheje toh button do
    bot.onText(/\/start/, (msg) => {
        sendAppButton(msg.chat.id);
    });

    // Jab koi galti se link ya koi text chat mein bheje, tab bhi button do
    bot.on('message', (msg) => {
        if (msg.text === '/start') return; // Ye upar handle ho gaya hai
        sendAppButton(msg.chat.id);
    });
}
