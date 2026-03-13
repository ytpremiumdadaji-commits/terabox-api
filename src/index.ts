import { tera } from "./lib/terabox";
import { isValidShareUrl, extractSurl, formatBytes, loadCookies } from "./lib/utils";

const port = process.env.PORT || 5000;

const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_DURATION = 2 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
};

// ==========================================
// 🎨 PREMIUM FRONTEND WITH ARTPLAYER
// ==========================================
const htmlPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TeraBox Stream & Download</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/artplayer/dist/artplayer.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #0f172a; }
        .glass-card { background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .artplayer-app { width: 100%; height: 250px; border-top-left-radius: 1rem; border-top-right-radius: 1rem; z-index: 10; }
        @media (min-width: 640px) { .artplayer-app { height: 350px; } }
    </style>
</head>
<body class="text-white min-h-screen flex flex-col items-center py-10 px-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black">
    
    <div class="max-w-2xl w-full relative z-10">
        
        <div class="text-center mb-10">
            <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mb-3">
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">TeraBox</span> Player
            </h1>
            <p class="text-slate-400 text-sm md:text-base font-medium">Ultra-Fast Direct CDN Stream. No Ads, No Buffering.</p>
        </div>

        <div id="searchSection" class="glass-card rounded-2xl shadow-2xl p-2 flex flex-col sm:flex-row gap-2 mb-8 relative transition-all">
            <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl blur opacity-20"></div>
            <div class="relative flex w-full flex-col sm:flex-row gap-2 z-10">
                <div class="flex-1 relative">
                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </div>
                    <input type="url" id="link" placeholder="Paste your TeraBox link here..." 
                        class="w-full pl-11 pr-4 py-4 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
                </div>
                <button onclick="getLinks()" id="searchBtn" 
                    class="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-8 rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-lg shadow-blue-500/30 active:scale-95">
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

            <div class="p-6 relative">
                <div class="mb-6">
                    <h3 id="filename" class="text-lg md:text-xl font-bold text-white line-clamp-2 leading-tight"></h3>
                    <div class="flex items-center gap-3 mt-2 text-sm text-slate-400 font-medium">
                        <span id="size" class="bg-slate-800 px-2 py-1 rounded-md text-blue-400"></span>
                        <span class="flex items-center gap-1">
                            <svg class="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            Direct CDN Fast
                        </span>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row gap-3">
                    <button onclick="playVideo()" 
                        class="flex-1 bg-white hover:bg-slate-200 text-slate-900 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                        Watch Now
                    </button>
                    
                    <a id="downloadBtn" href="#" 
                        class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 active:scale-95">
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
        let art = null;

        function initPlayer(url, poster) {
            if (art) { art.destroy(); }
            art = new Artplayer({
                container: '#artplayer-container',
                url: url,
                poster: poster,
                volume: 0.8,
                isLive: false,
                muted: false,
                autoplay: false,
                pip: true,
                autoSize: true,
                autoMini: true,
                screenshot: true,
                setting: true,
                loop: false,
                flip: true,
                playbackRate: true,
                aspectRatio: true,
                fullscreen: true,
                fullscreenWeb: true,
                subtitleOffset: true,
                miniProgressBar: true,
                mutex: true,
                backdrop: true,
                playsInline: true,
                autoPlayback: true,
                airplay: true,
                theme: '#3b82f6',
            });
        }

        function playVideo() {
            if(art) { art.play(); }
            document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function resetUI() {
            if(art) { art.destroy(); art = null; }
            document.getElementById('link').value = '';
            document.getElementById('resultCard').classList.add('hidden');
            document.getElementById('searchSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        async function getLinks() {
            const link = document.getElementById('link').value.trim();
            if(!link) return;

            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('resultCard').classList.add('hidden');
            document.getElementById('error').classList.add('hidden');
            const btn = document.getElementById('searchBtn');
            btn.disabled = true;
            btn.innerHTML = '<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>';

            try {
                const res = await fetch('/api?url=' + encodeURIComponent(link));
                const data = await res.json();

                document.getElementById('loading').classList.add('hidden');
                btn.disabled = false;
                btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg><span>Search</span>';

                if(data.status === 'success') {
                    document.getElementById('resultCard').classList.remove('hidden');
                    
                    const actualFilename = data.filename || 'TeraBox_Video.mp4';
                    document.getElementById('filename').innerText = actualFilename;
                    document.getElementById('size').innerText = data.size || 'N/A';
                    
                    // Naya: Proxy ke through perfect Range headers pass honge
                    const downloadUrl = "/proxy?url=" + encodeURIComponent(data.download) + "&name=" + encodeURIComponent(actualFilename);
                    const streamUrl = "/proxy?url=" + encodeURIComponent(data.stream) + "&action=play&name=" + encodeURIComponent(actualFilename);
                    
                    document.getElementById('downloadBtn').href = downloadUrl;

                    let bestThumb = '';
                    if (data.thumbs) {
                        bestThumb = data.thumbs.url3 || data.thumbs.url2 || data.thumbs.url1 || '';
                    }
                    
                    // Initialize Fast Player
                    initPlayer(streamUrl, bestThumb);

                } else {
                    document.getElementById('errorText').innerText = data.message || data.error || "Failed to fetch video.";
                    document.getElementById('error').classList.remove('hidden');
                }
            } catch(e) {
                document.getElementById('loading').classList.add('hidden');
                btn.disabled = false;
                btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg><span>Search</span>';
                document.getElementById('errorText').innerText = "Network Error! Please try again.";
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

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (pathname === "/") {
      return new Response(htmlPage, { 
        headers: { "Content-Type": "text/html", ...corsHeaders } 
      });
    }

    // ==========================================
    // 🛡️ ADVANCED PROXY (Copies True Headers for Fast Stream)
    // ==========================================
    if (pathname === "/proxy") {
      const targetUrl = url.searchParams.get("url");
      const action = url.searchParams.get("action");
      const fileNameRaw = url.searchParams.get("name") || "TeraBox_Video.mp4";
      const safeFileName = fileNameRaw.replace(/"/g, ''); 
      
      if (!targetUrl) return new Response("Missing URL", { status: 400 });

      const cookies = loadCookies();
      const ndusCookie = cookies["ndus"];

      const fetchHeaders = new Headers();
      fetchHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36");
      if (ndusCookie) {
        fetchHeaders.set("Cookie", \`ndus=\${ndusCookie}\`);
      }
      
      // ✅ Buffering theek karne ki sabse main line:
      const range = req.headers.get("Range");
      if (range) {
        fetchHeaders.set("Range", range);
      }

      try {
        // 'follow' karne se ye Asli CDN server par pahuch jata hai
        const proxyRes = await fetch(targetUrl, { 
            headers: fetchHeaders, 
            method: req.method,
            redirect: "follow" 
        });
        
        const resHeaders = new Headers();
        // Copy ONLY necessary headers to avoid conflicts
        const allowedHeaders = ['content-length', 'content-range', 'accept-ranges', 'content-type'];
        proxyRes.headers.forEach((value, key) => {
            if (allowedHeaders.includes(key.toLowerCase())) {
                resHeaders.set(key, value);
            }
        });
        
        resHeaders.set("Access-Control-Allow-Origin", "*");
        
        if (action === "play") {
            if (!resHeaders.has("content-type") || !resHeaders.get("content-type")?.includes("video")) {
                resHeaders.set("content-type", "video/mp4");
            }
        } else {
            resHeaders.set("content-disposition", 'attachment; filename="' + safeFileName + '"'); 
        }

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          headers: resHeaders
        });
      } catch (e) {
        return new Response("Proxy failed", { status: 500 });
      }
    }

    // Main API Route
    if (pathname === "/api") {
      try {
        const targetUrlRaw = url.searchParams.get("url");
        if (!targetUrlRaw || !targetUrlRaw.trim()) {
          return Response.json({ status: "error", message: "Missing required parameter: url" }, { status: 400, headers: corsHeaders });
        }

        const targetUrl = targetUrlRaw.trim();
        if (!targetUrl.startsWith("http") || !isValidShareUrl(targetUrl)) {
          return Response.json({ status: "error", message: "Invalid TeraBox share URL" }, { status: 400, headers: corsHeaders });
        }

        const surl = extractSurl(targetUrl);
        if (!surl) {
          return Response.json({ status: "error", message: "Could not extract surl" }, { status: 400, headers: corsHeaders });
        }

        let data;
        const cached = cache.get(surl);
        if (cached && Date.now() < cached.expiry) {
          data = cached.data;
        } else {
          data = await tera(surl);
          cache.set(surl, { data, expiry: Date.now() + CACHE_DURATION });
        }

        if (data && data.error) {
          return Response.json({ status: "error", error: data.error }, { status: 400, headers: corsHeaders });
        }

        let filename, size, download, thumbs;
        if (data && data.list && data.list.length > 0) {
          const firstItem = data.list[0];
          filename = firstItem.server_filename;
          size = formatBytes(firstItem.size);
          download = firstItem.dlink;
          thumbs = firstItem.thumbs;
        }

        return Response.json({
          status: "success",
          ...(filename && { filename }),
          ...(size && { size }),
          ...(download && { download }),
          ...(download && { stream: download }),
          ...(thumbs && { thumbs }),
        }, { headers: corsHeaders });

      } catch (error: any) {
        return Response.json({ status: "error", message: String(error) }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });
  },
});

console.log(`Bun server running on port ${port}`);
