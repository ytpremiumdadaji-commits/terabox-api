export async function tera(surl: string, ndusCookie: string): Promise<any> {
  let short_url = surl;
  if (surl.startsWith("1")) {
    short_url = surl.substring(1);
  }

  // ✅ Ab ye function direct passed cookie use karega
  const cookieString = "ndus=" + ndusCookie;

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
      return { error: "Failed to extract jsToken. Verification might be required." };
    }
    const jsToken = match[1];

    const signMatch = text.match(/"sign":"([^"]+)"/);
    const timestampMatch = text.match(/"timestamp":(\d+)/);
    const shareidMatch = text.match(/"shareid":(\d+)/);
    const ukMatch = text.match(/"uk":(\d+)/);

    const api_url = new URL("https://dm.terabox.app/share/list");
    api_url.searchParams.append("app_id", "250528");
    api_url.searchParams.append("jsToken", jsToken);
    api_url.searchParams.append("shorturl", short_url);
    api_url.searchParams.append("root", "1");

    const api_headers = {
      Host: "dm.terabox.app",
      "User-Agent": headers["User-Agent"],
      Accept: "application/json, text/plain, */*",
      Referer: first_url,
      Cookie: cookieString,
    };

    const list_response = await fetch(api_url.toString(), { headers: api_headers });
    const list_data = await list_response.json();

    if (!list_data || !list_data.list || list_data.list.length === 0) {
      return list_data; 
    }

    let fileItem = list_data.list[0];

    if (!fileItem.dlink && signMatch && timestampMatch && shareidMatch && ukMatch) {
      const fs_id = fileItem.fs_id;
      
      const dl_url = new URL("https://dm.terabox.app/share/download");
      dl_url.searchParams.append("app_id", "250528");
      dl_url.searchParams.append("web", "1");
      dl_url.searchParams.append("channel", "dubox");
      dl_url.searchParams.append("jsToken", jsToken);
      dl_url.searchParams.append("sign", signMatch[1]);
      dl_url.searchParams.append("timestamp", timestampMatch[1]);
      dl_url.searchParams.append("shareid", shareidMatch[1]);
      dl_url.searchParams.append("uk", ukMatch[1]);
      dl_url.searchParams.append("primaryid", shareidMatch[1]);
      dl_url.searchParams.append("fid_list", `[${fs_id}]`);

      const dl_response = await fetch(dl_url.toString(), { headers: api_headers });
      const dl_data = await dl_response.json();

      let raw_dlink = null;
      if (dl_data.dlink) {
        raw_dlink = dl_data.dlink;
      } else if (dl_data.list && dl_data.list.length > 0 && dl_data.list[0].dlink) {
        raw_dlink = dl_data.list[0].dlink;
      }

      if (raw_dlink) {
        try {
          const redirectRes = await fetch(raw_dlink, {
            headers: api_headers,
            redirect: "manual" 
          });
          
          const realLink = redirectRes.headers.get("location");
          if (realLink) {
            fileItem.dlink = realLink; 
          } else {
            fileItem.dlink = raw_dlink;
          }
        } catch(e) {
          fileItem.dlink = raw_dlink;
        }
      }
    }

    return { list: [fileItem] };
  } catch (error: any) {
    return { error: String(error) };
  }
}
