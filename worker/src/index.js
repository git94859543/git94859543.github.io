const DATA_PATH = "student-hub-data.json";
const SCHEDULE_PATH = "schedule.docx";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (origin && !allowedOrigins.includes(origin)) {
      return json({ error: "Origin is not allowed." }, 403);
    }
    if (request.method === "OPTIONS") {
      return addCors(new Response(null, { status: 204 }), origin, allowedOrigins);
    }

    let response;
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/auth" && request.method === "POST") {
        response = await authenticate(request, env);
      } else if (url.pathname === "/api/session" && request.method === "GET") {
        response = await isAuthorized(request, env)
          ? json({ authenticated: true })
          : json({ error: "Unauthorized." }, 401);
      } else if (url.pathname === "/api/state" && request.method === "GET") {
        const file = await readRepoFile(env, DATA_PATH);
        const state = file ? JSON.parse(decodeUtf8(file.bytes)) : { links: [] };
        response = json({
          initialized: Boolean(file),
          links: Array.isArray(state.links) ? state.links : [],
        });
      } else if (url.pathname === "/api/state" && request.method === "PUT") {
        if (!(await isAuthorized(request, env))) {
          response = json({ error: "Unauthorized." }, 401);
        } else {
          const body = await request.json();
          const links = validateLinks(body?.links);
          await writeRepoFile(
            env,
            DATA_PATH,
            new TextEncoder().encode(JSON.stringify({ links }, null, 2)),
            "Update Student Hub links"
          );
          response = json({ saved: true });
        }
      } else if (url.pathname === "/api/schedule" && request.method === "GET") {
        const file = await readRepoFile(env, SCHEDULE_PATH);
        response = file
          ? new Response(file.bytes, {
              headers: {
                "Content-Type": DOCX_MIME,
                "Cache-Control": "no-store",
                "Content-Disposition": 'inline; filename="schedule.docx"',
              },
            })
          : json({ error: "Schedule not found." }, 404);
      } else if (url.pathname === "/api/schedule" && request.method === "PUT") {
        if (!(await isAuthorized(request, env))) {
          response = json({ error: "Unauthorized." }, 401);
        } else if (request.headers.get("Content-Type")?.split(";")[0] !== DOCX_MIME) {
          response = json({ error: "A DOCX file is required." }, 415);
        } else {
          const bytes = new Uint8Array(await request.arrayBuffer());
          if (bytes.length < 4 || bytes.length > 20 * 1024 * 1024) {
            response = json({ error: "DOCX size must be between 4 bytes and 20 MB." }, 413);
          } else {
            await writeRepoFile(env, SCHEDULE_PATH, bytes, "Update Student Hub schedule");
            response = json({ saved: true, name: SCHEDULE_PATH });
          }
        }
      } else {
        response = json({ error: "Not found." }, 404);
      }
    } catch (error) {
      console.error("Student Hub API error:", error);
      response = json({ error: "The request could not be completed." }, 500);
    }

    return addCors(response, origin, allowedOrigins);
  },
};

async function authenticate(request, env) {
  if (!env.ADMIN_CODE || !env.SESSION_SECRET) {
    return json({ error: "Server authentication is not configured." }, 503);
  }
  const body = await request.json();
  const code = typeof body?.code === "string" ? body.code : "";
  if (!/^[A-Za-z0-9]{9}$/.test(code) || !constantTimeEqual(code, env.ADMIN_CODE)) {
    return json({ error: "Invalid code." }, 401);
  }

  const payload = base64UrlEncode(JSON.stringify({
    sub: "admin",
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  }));
  const signature = await sign(payload, env.SESSION_SECRET);
  return json({ token: `${payload}.${signature}`, expiresIn: TOKEN_TTL_SECONDS });
}

async function isAuthorized(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match || !env.SESSION_SECRET) return false;
  const [payload, signature, extra] = match[1].split(".");
  if (!payload || !signature || extra) return false;
  if (!(await verifySignature(payload, signature, env.SESSION_SECRET))) return false;
  try {
    const claims = JSON.parse(base64UrlDecode(payload));
    return claims.sub === "admin" && Number.isFinite(claims.exp) && claims.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

function validateLinks(value) {
  if (!Array.isArray(value) || value.length > 500) {
    throw new Error("Invalid links list.");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid link.");
    const id = String(item.id || "");
    const category = String(item.category || "");
    const name = String(item.name || "").trim();
    const rawUrl = String(item.url || "").trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new Error("Invalid link URL.");
    }
    if (
      !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
      !["zoom", "classroom"].includes(category) ||
      !name ||
      name.length > 80 ||
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      rawUrl.length > 2048
    ) {
      throw new Error("Invalid link.");
    }
    return { id, category, name, url: parsedUrl.href };
  });
}

async function readRepoFile(env, path, includeBytes = true) {
  const response = await githubRequest(env, path, "GET");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}).`);
  const file = await response.json();
  if (!includeBytes) return { sha: file.sha, bytes: null };
  if (file.encoding === "base64" && typeof file.content === "string" && file.content.trim()) {
    return { sha: file.sha, bytes: base64ToBytes(file.content) };
  }
  const raw = await githubRequest(env, path, "GET", undefined, "application/vnd.github.raw+json");
  if (!raw.ok) throw new Error(`GitHub raw file read failed (${raw.status}).`);
  return { sha: file.sha, bytes: new Uint8Array(await raw.arrayBuffer()) };
}

async function writeRepoFile(env, path, bytes, message) {
  const existing = await readRepoFile(env, path, false);
  const body = {
    message,
    content: bytesToBase64(bytes),
    branch: env.GITHUB_BRANCH || "main",
  };
  if (existing?.sha) body.sha = existing.sha;
  const response = await githubRequest(env, path, "PUT", body);
  if (!response.ok) {
    const detail = await response.text();
    console.error("GitHub write failed:", response.status, detail.slice(0, 500));
    throw new Error(`GitHub write failed (${response.status}).`);
  }
}

function githubRequest(env, path, method, body, accept = "application/vnd.github+json") {
  if (!env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_TOKEN) {
    throw new Error("GitHub integration is not configured.");
  }
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${encodedPath}`
  );
  if (method === "GET") url.searchParams.set("ref", env.GITHUB_BRANCH || "main");
  return fetch(url, {
    method,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Student-Hub-API",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function addCors(response, origin, allowedOrigins) {
  const headers = new Headers(response.headers);
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
    headers.append("Vary", "Origin");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a[i] || 0) ^ (b[i] || 0);
  }
  return difference === 0;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySignature(value, signature, secret) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(value));
  } catch {
    return false;
  }
}

function base64ToBytes(value) {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncode(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(normalized + "=".repeat((4 - normalized.length % 4) % 4));
}

function base64UrlDecode(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}
