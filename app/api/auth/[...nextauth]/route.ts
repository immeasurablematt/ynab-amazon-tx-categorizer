import { handlers } from "@/auth";

const { GET: _GET, POST: _POST } = handlers;

// Strip `scope` param from YNAB OAuth redirects
// YNAB doesn't support scope and rejects requests that include it
function stripYnabScope(res: Response): Response {
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (location?.includes("app.ynab.com/oauth/authorize")) {
      const url = new URL(location);
      url.searchParams.delete("scope");
      const newHeaders = new Headers(res.headers);
      newHeaders.set("location", url.toString());
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    }
  }
  return res;
}

async function GET(req: Request) {
  return stripYnabScope(await _GET(req));
}

async function POST(req: Request) {
  return stripYnabScope(await _POST(req));
}

export { GET, POST };
