import { redirect } from "next/navigation";

export default function PostRedirect({ params }: { params: { id: string } }) {
  redirect(`/p/${params.id}`);
}
