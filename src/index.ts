import { tera } from "./lib/terabox";
import { isValidShareUrl, extractSurl, formatBytes } from "./lib/utils";

const port = process.env.PORT || 5000;

const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_DURATION = 2 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ==========================================
// 🎨 YE HAI AAPKI WEBSITE KA FRONTEND (HTML)
// ==========================================
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
            <p class="text-[10px] text-gray-500 mt-4">* Links expire in 8 hours. Generated via API.</p>
        </div>

    </div>

    <script>
        async function getLinks() {
            const link = document.getElementById('link').value.trim();
            if(!link) return alert("Please paste a Terabox link first!");

            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('result').classList.add('hidden');
            document.getElementById('error').classList.add('hidden');
            document.getElementById('btn').disabled = true;
            document.getElementById('btn').classList.add('opacity-50');

            try {
                // Yahan API call ho rahi hai (usi server par)
                const res = await fetch('/api?url=' + encodeURIComponent(link));
                const data = await res.json();

                document.getElementById('loading').classList.add('hidden');
                document.getElementById('btn').disabled = false;
                document.getElementById('btn').classList.remove('opacity-50');

                if(data.status === 'success') {
                    document.getElementById('result').classList.remove('hidden');
                    document.getElementById('filename').innerText = data.filename || 'Unknown File';
                    document.getElementById('size').innerText = 'Size: ' + (data.size || 'N/A');
                    document.getElementById('downloadBtn').href = data.download;
                    document.getElementById('streamBtn').href = data.stream;

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

    // YAHAN BADLAAV KIYA HAI: Ab homepage (/) par JSON nahi, Website dikhegi!
    if (pathname === "/") {
      return new Response(htmlPage, { 
        headers: { 
            "Content-Type": "text/html",
            ...corsHeaders
        } 
      });
    }

    // Ye purana API code hai, ye waisa hi rahega backend ke liye
    if (pathname === "/api") {
      try {
        const startTime = Date.now();
        const targetUrlRaw = url.searchParams.get("url");

        if (!targetUrlRaw || !targetUrlRaw.trim()) {
          return Response.json(
            { status: "error", message: "Missing required parameter: url" },
            { status: 400, headers: corsHeaders },
          );
        }

        const targetUrl = targetUrlRaw.trim();

        if (!targetUrl.startsWith("http") || !isValidShareUrl(targetUrl)) {
          return Response.json(
            { status: "error", message: "Invalid TeraBox share URL" },
            { status: 400, headers: corsHeaders },
          );
        }

        const surl = extractSurl(targetUrl);
        if (!surl) {
          return Response.json(
            { status: "error", message: "Could not extract surl from URL" },
            { status: 400, headers: corsHeaders },
          );
        }

        let data;
        const cached = cache.get(surl);
        if (cached && Date.now() < cached.expiry) {
          data = cached.data;
        } else {
          data = await tera(surl);
          cache.set(surl, { data, expiry: Date.now() + CACHE_DURATION });
        }
        const responseTime = ((Date.now() - startTime) / 1000).toFixed(3) + "s";

        if (data && data.error) {
          return Response.json(
            { status: "error", error: data.error, response_time: responseTime },
            { status: 400, headers: corsHeaders },
          );
        }

        let filename, size, download, stream, thumbs;

        if (data && data.list && data.list.length > 0) {
          const firstItem = data.list[0];
          filename = firstItem.server_filename;
          size = formatBytes(firstItem.size);
          download = firstItem.dlink;
          stream = firstItem.dlink;
          thumbs = firstItem.thumbs;
        }

        return Response.json(
          {
            status: "success",
            response_time: responseTime,
            ...(filename && { filename }),
            ...(size && { size }),
            ...(download && { download }),
            ...(stream && { stream }),
            ...(thumbs && { thumbs }),
          },
          { headers: corsHeaders },
        );
      } catch (error: any) {
        return Response.json(
          { status: "error", message: String(error) },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });
  },
});

console.log(`Bun server running on port ${port}`);
