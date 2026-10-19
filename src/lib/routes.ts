/** Addresses of the views reached from the Companies section, in one place. */
const enc = encodeURIComponent;

export const routes = {
  company: (id: string) => `/companies/${id}`,
  companies: () => "/companies",
  findings: (opts: { insight?: string; severity?: string; category?: string } = {}) =>
    `/companies?tab=findings${opts.insight ? `&insight=${enc(opts.insight)}` : ""}${opts.severity ? `&severity=${enc(opts.severity)}` : ""}${opts.category ? `&category=${enc(opts.category)}` : ""}`,
  compareSide: (ids: string[]) => `/companies?tab=compare&mode=side&ids=${ids.join(",")}`,
  comparePeers: (id: string) => `/companies?tab=compare&mode=peers&subject=${id}`,
  benchmark: (metric?: string, group?: string) => `/companies?tab=compare&mode=benchmark${metric ? `&metric=${metric}` : ""}${group ? `&group=${group}` : ""}`,
  ask: (q?: string) => `/companies?tab=ask${q ? `&q=${enc(q)}` : ""}`,
};
