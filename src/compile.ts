import path from "path";
import fs from "fs/promises";
import ejs from "ejs";

const __dirname = path.resolve();
const SITE_DIR = path.resolve(__dirname, "site");
const DIST_DIR = path.resolve(__dirname, "dist");

async function readBlogPosts(): Promise<
  Array<{
    slug: string;
    title?: string | undefined;
    date?: string | undefined;
    excerpt?: string | undefined;
  }>
> {
  const postsDir = path.join(SITE_DIR, "blog");

  try {
    const entries = await fs.readdir(postsDir);
    const files = entries.filter((f) => f.endsWith(".ejs"));

    const posts = await Promise.all(
      files.map(async (file) => {
        const slug = file.replace(/\.ejs$/, "");
        const full = path.join(postsDir, file);
        let src = "";
        try {
          src = await fs.readFile(full, "utf8");
        } catch (e) {
          return { slug };
        }

        const titleMatch = src.match(/var\s+title\s*=\s*(['`\"])([\s\S]*?)\1/);
        const dateMatch = src.match(/var\s+date\s*=\s*(['`\"])([\s\S]*?)\1/);
        const contentMatch = src.match(/var\s+content\s*=\s*`([\s\S]*?)`/);

        const title = titleMatch
          ? String(titleMatch[2] ?? "").trim()
          : undefined;
        const date = dateMatch ? String(dateMatch[2] ?? "").trim() : undefined;
        const content = contentMatch
          ? String(contentMatch[1] ?? "")
          : undefined;

        let excerpt: string | undefined = undefined;
        if (content) {
          const pMatch = content.match(/<p>([\s\S]*?)<\/p>/i);
          if (pMatch && pMatch[1]) {
            excerpt = String(pMatch[1])
              .replace(/<[^>]+>/g, "")
              .trim();
          } else {
            const plain = content.replace(/<[^>]+>/g, "").trim();
            excerpt = plain.slice(0, 200) + (plain.length > 200 ? "…" : "");
          }
        }

        return { slug, title, date, excerpt };
      })
    );

    posts.sort((a, b) => {
      if (a.date && b.date)
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    return posts;
  } catch (e) {
    return [];
  }
}

async function ensureCleanDist() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
}

async function copyStatic() {
  // copy known static folders
  const staticDirs = ["fonts", "icons", "js"];
  for (const d of staticDirs) {
    const src = path.join(SITE_DIR, d);
    try {
      const stat = await fs.stat(src);
      if (stat.isDirectory()) {
        const dest = path.join(DIST_DIR, d);
        // recursive copy
        await fs.cp(src, dest, { recursive: true });
      }
    } catch (e) {
      // ignore missing dirs
    }
  }
}

async function collectEjsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (it.name === "blocks") continue; // skip partials
      const sub = await collectEjsFiles(full);
      out.push(...sub);
    } else {
      if (it.name.endsWith(".ejs")) {
        // skip shared templates
        if (it.name === "blog-post.ejs") continue;
        out.push(full);
      }
    }
  }
  return out;
}

async function renderFileToDist(filePath: string, posts: any[]) {
  const rel = path.relative(SITE_DIR, filePath);
  const view = rel.replace(/\\/g, "/").replace(/\.ejs$/, "");

  // compute output path
  let outPath: string;
  if (view === "index") {
    outPath = path.join(DIST_DIR, "index.html");
  } else {
    const outDir = path.join(DIST_DIR, view);
    await fs.mkdir(outDir, { recursive: true });
    outPath = path.join(outDir, "index.html");
  }

  // locals
  const locals: Record<string, unknown> = {};
  if (view === "blog") {
    locals.posts = posts;
  }

  // render EJS (ensure includes resolve by passing filename)
  const html = await new Promise<string>((resolve, reject) => {
    ejs.renderFile(
      filePath,
      locals,
      { root: SITE_DIR },
      (err: Error | null, str?: string) => {
        if (err) reject(err);
        else resolve(String(str ?? ""));
      }
    );
  });

  await fs.writeFile(outPath, html, "utf8");
  console.log("Wrote", outPath);
}

async function main() {
  await ensureCleanDist();
  await copyStatic();

  const posts = await readBlogPosts();

  const files = await collectEjsFiles(SITE_DIR);

  for (const f of files) {
    try {
      await renderFileToDist(f, posts);
    } catch (e) {
      console.error("Failed to render", f, e);
    }
  }

  console.log("Done. Output in", DIST_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
