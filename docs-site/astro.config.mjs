import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  srcDir: "./docs-site/src",
  publicDir: "./docs-site/public",
  outDir: "./public/docs",
  base: "/docs",
  site: "https://clawptcha.idosalomon.workers.dev",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  integrations: [
    starlight({
      title: "CLAWPTCHA Docs",
      description: "Repository policy, triage, passive signals, and challenge operations for CLAWPTCHA.",
      customCss: ["/docs-site/src/styles/starlight.css"],
      editLink: {
        baseUrl: "https://github.com/idosal/CLAWPTCHA/edit/main/",
      },
      lastUpdated: true,
      pagefind: false,
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/idosal/CLAWPTCHA" },
      ],
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Overview", slug: "index" },
            { label: "Why use CLAWPTCHA", slug: "why-clawptcha" },
            { label: "Getting started", slug: "getting-started" },
          ],
        },
        {
          label: "Operate",
          items: [
            { label: "Policy evaluation", slug: "policy" },
            { label: "Issue-backed triage", slug: "issue-triage" },
            { label: "Passive signals", slug: "passive-signals" },
            { label: "Challenge lifecycle", slug: "challenge-lifecycle" },
            { label: "Common practices", slug: "common-practices" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Configuration", slug: "configuration" },
          ],
        },
      ],
    }),
  ],
});
