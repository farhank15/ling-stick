import type { RouteConfig } from "@react-router/dev/routes";
import { index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),

  layout("routes/app.tsx", [
    index("routes/_index.tsx"),
    route("library", "routes/library.tsx"),
    route("library/:id", "routes/library.$id.tsx"),
    route("bank", "routes/bank.tsx"),
    route("review", "routes/review.tsx"),
    route("explore", "routes/explore._index.tsx"),
    route("explore/:category", "routes/explore.$category.tsx"),
    route("extract", "routes/extract.tsx"),
    route("translate", "routes/translate.tsx"),
    route("chat", "routes/chat.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),

  // Resource routes (API)
  route("api/suggest", "routes/api.suggest.ts"),
  route("api/generate", "routes/api.generate.ts"),
  route("api/items", "routes/api.items.ts"),
  route("api/items/:id", "routes/api.items.$id.ts"),
  route("api/items/bulk", "routes/api.items.bulk.ts"),
  route("api/usage-examples", "routes/api.usage-examples.ts"),
  route("api/review", "routes/api.review.ts"),
  route("api/quiz", "routes/api.quiz.ts"),
  route("api/flash", "routes/api.flash.ts"),
  route("api/bank", "routes/api.bank.ts"),
  route("api/explore/:category", "routes/api.explore.$category.ts"),
  route("api/explore/:id/hide", "routes/api.explore.$id.hide.ts"),
  route("api/explore-save", "routes/api.explore-save.ts"),
  route("api/extract", "routes/api.extract.ts"),
  route("api/check-sentence", "routes/api.check-sentence.ts"),
  route("api/translate", "routes/api.translate.ts"),
  route("api/export", "routes/api.export.ts"),
  route("api/models", "routes/api.models.ts"),
  route("api/lara", "routes/api.lara.ts"),
  route("api/stats", "routes/api.stats.ts"),
  route("api/logout", "routes/api.logout.ts"),
  route("api/chat", "routes/api.chat.ts"),
  route("api/chat/sessions", "routes/api.chat.sessions.ts"),
  route("api/import", "routes/api.import.ts"),
] satisfies RouteConfig;
