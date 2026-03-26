/**
 * Cloudflare Pages Function: proxy Whisper ONNX model files from R2.
 * Requests to /models/<path> are served from R2 key "models/<path>".
 * Long cache headers are safe because model files are immutable for a given model version.
 *
 * @param {EventContext} ctx
 */
export async function onRequestGet(ctx) {
  const path = new URL(ctx.request.url).pathname.replace(/^\/models\//, "");
  if (!path) return new Response(null, { status: 400 });

  const object = await ctx.env.MODELS.get("models/" + path);
  if (!object) return new Response(null, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
