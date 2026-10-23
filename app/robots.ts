// While the site is unfinished, every crawler is asked to stay out. Remove the disallow at launch.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
