import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  srcDir: "./docs-site/src",
  publicDir: "./docs-site/public",
  outDir: "./public/docs",
  base: "/docs",
  site: "https://voucha.dev",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  integrations: [
    starlight({
      title: "VOUCHA Docs",
      description: "Repository policy, triage, passive signals, and challenge operations for VOUCHA.",
      customCss: ["/docs-site/src/styles/starlight.css"],
      editLink: {
        baseUrl: "https://github.com/idosal/VOUCHA/edit/main/",
      },
      lastUpdated: true,
      pagefind: false,
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/idosal/VOUCHA" },
      ],
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Overview", slug: "index" },
            { label: "Why use VOUCHA", slug: "why-voucha" },
            { label: "Getting started", slug: "getting-started" },
            { label: "Deployment", slug: "deployment" },
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
            { label: "Verification checklist", slug: "verification" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Privacy and data", slug: "privacy-data" },
            { label: "Configuration", slug: "configuration" },
          ],
        },
      ],
    }),
  ],
});
