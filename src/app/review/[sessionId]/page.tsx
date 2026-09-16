import { ReviewPage } from "@/components/review/review-page";

export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReviewPage sessionId={sessionId} />;
}
