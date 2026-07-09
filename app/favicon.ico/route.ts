const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="12" fill="#0A0A0A"/>
  <circle cx="24" cy="24" r="17" fill="#fff"/>
  <path d="M14 28h20v4H14z" fill="#E30613"/>
  <path d="M16 18h16l-5 6 6 6H17l5-6-6-6z" fill="#111"/>
</svg>`;

export function GET() {
  return new Response(icon, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
