export const REQUIRED_PACKED_FILES = [
  "dist/bin/md2vid.js",
  "dist/scripts/build.js",
  "dist/scripts/check_release_name.js",
  "dist/scripts/cli_args.js",
  "dist/scripts/hyperframes_cli.js",
  "dist/scripts/managed_file_transaction.js",
  "dist/scripts/install_skill.js",
  "dist/scripts/upgrade.js",
  "dist/scripts/package_root.js",
  "dist/scripts/platform_support.js",
  "dist/scripts/project_layout.js",
  "dist/scripts/scaffold_project.js",
  "dist/scripts/skill_references.js",
  "dist/frameworks/assets.js",
  "dist/frameworks/hyperframes/templates/caption-skin.html",
  "dist/frameworks/remotion/templates/render.ts",
  "dist/frameworks/remotion/templates/remotion.config.ts",
  "dist/frameworks/remotion/templates/tsconfig.json",
  "dist/frameworks/remotion/templates/src/index.ts",
  "dist/frameworks/remotion/templates/src/Root.tsx",
  "dist/frameworks/remotion/templates/src/Video.tsx",
  "dist/docs/standards/frameworks/remotion.md",
  "docs/standards/frameworks/remotion.md",
  "postinstall.mjs",
  "skill/md2vid/SKILL.md",
  "skill/md2vid/references/standards/video-generation.md",
  "skill/md2vid/references/standards/git.md",
  "skill/md2vid/references/standards/design/frame.md",
  "skill/md2vid/references/standards/design/knowledge-expression.md",
  "skill/md2vid/references/standards/design/frame-content.md",
  "skill/md2vid/references/standards/frameworks/hyperframes.md",
  "skill/md2vid/references/standards/frameworks/remotion.md",
  "README.md",
  "LICENSE",
] as const;

export const FORBIDDEN_PACKED_PREFIXES = [
  "outputs/",
  "test/",
  "node_modules/",
  "docs/superpowers/",
  "examples/",
] as const;

const removedGsapVendorFile = ["vendor", ["gsap", "min", "js"].join(".")].join("/");

export const FORBIDDEN_PACKED_FILES = [
  `frameworks/hyperframes/templates/${removedGsapVendorFile}`,
  `dist/frameworks/hyperframes/templates/${removedGsapVendorFile}`,
] as const;
