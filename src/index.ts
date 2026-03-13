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

const htmlPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TeraBox Video Downloader</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .glass-panel { background: rgba(31, 41, 55, 0.7); backdrop-filter: blur(10px); }
    </style>
</head>
<body class="bg-gray-900 text-white min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-black">
    <div class="max-w-md w-full glass-panel border border-gray-700 rounded-2xl shadow-2xl p-6 sm:p-8">
        
        <div class="text-center mb-6">
            <h1 class="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">TeraBox DL</h1>
            <p class="text-gray-400 text-sm">Download or Stream TeraBox Videos easily!</p>
        </div>

        <div class="space-y-4">
            <input type="url" id="link" placeholder="Paste your Terabox Link here..." 
                class="w-full p-4 rounded-xl bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-gray-500">
            
            <button onclick="getLinks()" id="btn" 
                class="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 font-bold py-4 rounded-xl transition-all shadow-lg transform hover:scale-[1.02] active:scale-95">
                🚀 Get Links
            </button>
        </div>

        <div id="loading" class="hidden text-center mt-6">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p class="text-gray-400 text-sm animate-pulse">Bypassing TeraBox Security... ⏳</p>
        </div>

        <div id="error" class="hidden text-center mt-6 bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg text-sm"></div>

        <div id="result" class="hidden mt-8 bg-gray-800 border border-gray-700 p-5 rounded-xl text-center shadow-inner">
            <img id="thumb" src="" alt="Thumbnail" class="w-full h-40 object-cover rounded-lg mb-4 hidden shadow-md">
            <p id="filename" class="font-semibold text-sm mb-1 text-gray-200 break-all line-clamp-2"></p>
            <p id="size" class="text-xs text-blue-400 font-mono mb-5"></p>
            
            <div class="flex flex-col gap-3 sm:flex-row">
                <a id="downloadBtn" href="#" target="_blank" 
                    class="flex-1 bg-green-600 hover:bg-green-700 py-3 rounded-lg font-bold text-sm shadow-lg flex justify-center items-center gap-2 transition-colors">
                    <span>⬇️</span> Download
                </a>
                <a id="streamBtn" href="#" target="_blank" 
                    class="flex-1 bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-bold text-sm shadow-lg flex justify-center items-center gap-2 transition-colors">
                    <span>📺</span> Play Online
                </a>
            </div>
            
            <div id="player-container" class="hidden mt-4">
                <video id="videoPlayer" controls class="w-full rounded-lg shadow-lg">
                    Your browser does not support the video tag.
                </video>
            </div>

            <p class="text-[10px] text-gray-500 mt-4">* Video will be proxied securely through server.</p>
        </div>

    </div>

    <script>
        async function getLinks() {
            const link = document.getElementById('link').value.trim();
            if(!link) return alert("Please paste a Terabox link first!");

            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('result').classList.add('hidden');
            document.getElementById('error').classList.add('hidden');
            document.getElementById('player-container').classList.add('hidden');
            const videoElement = document.getElementById('videoPlayer');
            videoElement.pause();
            videoElement.removeAttribute('src');
            
            document.getElementById('btn').disabled = true;
            document.getElementById('btn').classList.add('opacity-50');

            try {
                const res = await fetch('/api?url=' + encodeURIComponent(link));
                const data = await res.json();

                document.getElementById('loading').classList.add('hidden');
                document.getElementById('btn').disabled = false;
                document.getElementById('btn').classList.remove('opacity-50');

                if(data.status === 'success') {
                    document.getElementById('result').classList.remove('hidden');
                    document.getElementById('filename').innerText = data.filename || 'Unknown File';
                    document.getElementById('size').innerText = 'Size: ' + (data.size || 'N/A');
                    
                    // Download link waisa hi rahega (Original link ya fir Proxy without play override)
                    document.getElementById('downloadBtn').href = data.download;
                    
                    // Stream ke liye proxy URL banayenge jisme action=play laga hoga
                    const streamUrl = "/proxy?url=" + encodeURIComponent(data.stream) + "&action=play";
                    document.getElementById('streamBtn').href = streamUrl;

                    // Web Player mein video set karke dikhana
                    videoElement.src = streamUrl;
                    document.getElementById('player-container').classList.remove('hidden');

                    if(data.thumbs && data.thumbs.url1) {
                        const img = document.getElementById('thumb');
                        img.src = data.thumbs.url1;
                        img.classList.remove('hidden');
                    }
                } else {
                    document.getElementById('error').innerText = "Error: " + (data.message || data.error || "Failed to fetch");
                    document.getElementById('error').classList.remove('hidden');
                }
            } catch(e) {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('btn').disabled = false;
                document.getElementById('btn').classList.remove('opacity-50');
                document.getElementById('error').innerText = "Network Error! Please try again.";
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
    // 🛡️ PROXY ROUTE (Fixes Download/Stream Issue)
    // ==========================================
    if (pathname === "/proxy") {
      const targetUrl = url.searchParams.get("url");
      const action = url.searchParams.get("action"); // 'play' action stream ke liye check karenge
      
      if (!targetUrl) return new Response("Missing URL", { status: 400 });

      const cookies = loadCookies();
      const ndusCookie = cookies["ndus"];

      const fetchHeaders = new Headers();
      fetchHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36");
      if (ndusCookie) {
        fetchHeaders.set("Cookie", `ndus=${ndusCookie}`);
      }
      
      const range = req.headers.get("Range");
      if (range) {
        fetchHeaders.set("Range", range);
      }

      try {
        const proxyRes = await fetch(targetUrl, { headers: fetchHeaders, method: req.method });
        const resHeaders = new Headers(proxyRes.headers);
        resHeaders.set("Access-Control-Allow-Origin", "*");
        
        // ✨ THE MAGIC TRICK: Agar action 'play' hai, toh force download ko hata do aur video format daal do
        if (action === "play") {
            resHeaders.delete("content-disposition"); // "download karlo" wali command delete!
            
            // Browser ko batana ki ye file mp4 video hai
            const currentType = resHeaders.get("content-type") || "";
            if (!currentType.includes("video")) {
                resHeaders.set("content-type", "video/mp4");
            }
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
