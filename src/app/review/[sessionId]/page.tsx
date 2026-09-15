import { ReviewPage } from "@/components/review/review-page";

export default function Page({
  params,
}: {
  params: { sessionId: string };
}) {
  return <ReviewPage sessionId={params.sessionId} />;
}
