import { headers } from "next/headers";

export async function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      nonce={(await headers()).get("x-nonce") ?? undefined}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
