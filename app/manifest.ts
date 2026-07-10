import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "СКМ | Вентиляция и холодоснабжение",
    short_name: "СКМ",
    description:
      "Монтаж, ремонт и обслуживание вентиляции, чиллеров и фанкойлов для коммерческих и промышленных объектов.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    lang: "ru",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
