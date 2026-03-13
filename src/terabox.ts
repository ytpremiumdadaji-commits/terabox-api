import { loadCookies } from "./utils";

export async function tera(surl: string): Promise<any> {
  let short_url = surl;
  if (surl.startsWith("1")) {
    short_url = surl.substring(1);
  }

  const cookies = loadCookies();
  let ndusCookie = cookies["ndus"];
  console.log("[DEBUG] Loaded ndus cookie:", ndusCookie);

  const cookieString = `ndus=${ndusCookie}`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    Cookie: cookieString,
  };

  const first_url = `https://dm.terabox.app/sharing/link?surl=${surl}`;

  try {
    const response = await fetch(first_url, { headers });
    const text = await response.text();

    const match = text.match(/fn%28%22(.*?)%22%29/);
    if (!match) {
      return {
        error:
          "Failed to extract jsToken. Verification might be required or Cloudflare blocked the request.",
      };
    }
    const jsToken = match[1];

    const api_url = new URL("https://dm.terabox.app/share/list");
    api_url.searchParams.append("app_id", "250528");
    api_url.searchParams.append("jsToken", jsToken);
    api_url.searchParams.append("site_referer", "https://www.terabox.app/");
    api_url.searchParams.append("shorturl", short_url);
    api_url.searchParams.append("root", "1");

    const api_headers = {
      Host: "dm.terabox.app",
      "User-Agent": headers["User-Agent"],
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `https://dm.terabox.app/sharing/link?surl=${short_url}&clearCache=1`,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://dm.terabox.app",
      Cookie: cookieString,
    };

    const api_response = await fetch(api_url.toString(), {
      headers: api_headers,
    });
    const data = await api_response.json();

    return data;
  } catch (error: any) {
    return { error: String(error) };
  }
}
