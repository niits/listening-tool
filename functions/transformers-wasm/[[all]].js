/**
 * Cloudflare Pages Function: proxy ONNX Runtime WASM binaries from R2.
 * Requests to /transformers-wasm/<path> are served from R2 key "transformers-wasm/<path>".
 *
 * The Cross-Origin-Embedder-Policy header is required for SharedArrayBuffer
 * support, which ONNX Runtime Web uses for threaded WASM execution.
 *
 * @param {EventContext} ctx
 */
export async function onRequestGet(ctx) {
  const path = new URL(ctx.request.url).pathname.replace(
    /^\/transformers-wasm\//,
    ""
  );
  if (!path) return new Response(null, { status: 400 });

  const object = await ctx.env.MODELS.get("transformers-wasm/" + path);
  if (!object) return new Response(null, { status: 404 });

  // Dynamic import() requires text/javascript — infer from extension since wrangler
  // may not set contentType for .mjs files when uploading without explicit --content-type.
  const contentType = path.endsWith(".mjs")
    ? "text/javascript"
    : object.httpMetadata?.contentType ?? "application/wasm";

  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  });
}
