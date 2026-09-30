/** Baca body request: dukung JSON maupun form-urlencoded (dari <fetcher.Form>). */
export async function readBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<T> {
  const ct = request.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) {
    const json = await request.json().catch(() => ({}));
    return json as T;
  }
  const form = await request.formData().catch(() => new FormData());
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out as T;
}
