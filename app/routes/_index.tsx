import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { listItems } from "~/lib/items.server";
import { QuickTranslate } from "~/components/QuickTranslate";
import { RecentItems } from "~/components/RecentItems";
import { Capture } from "~/components/Capture";

export const meta: MetaFunction = () => [{ title: "LingStick" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const recent = await listItems({ limit: 5 });
  return { recent };
}

export default function Index() {
  const { recent } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-5">
      <QuickTranslate />
      <Capture />
      <RecentItems items={recent} />
    </div>
  );
}
