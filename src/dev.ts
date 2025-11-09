import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIEWS_DIR = path.resolve(__dirname, "../site");

app.use(express.static(VIEWS_DIR));

app.set("views", VIEWS_DIR);
app.set("view engine", "ejs");

async function readBlogPosts(): Promise<
  Array<{
    slug: string;
    title?: string | undefined;
    date?: string | undefined;
    excerpt?: string | undefined;
  }>
> {
  const postsDir = path.resolve(__dirname, "../site/blog");
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
          // try to extract first <p>...</p>
          const pMatch = content.match(/<p>([\s\S]*?)<\/p>/i);
          if (pMatch && pMatch[1]) {
            // strip tags inside the paragraph
            excerpt = String(pMatch[1])
              .replace(/<[^>]+>/g, "")
              .trim();
          } else {
            // fallback: strip tags and take first 200 chars
            const plain = content.replace(/<[^>]+>/g, "").trim();
            excerpt = plain.slice(0, 200) + (plain.length > 200 ? "…" : "");
          }
        }

        return { slug, title, date, excerpt };
      })
    );

    // sort by date (newest first) if available
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

app.get("*splat", async (req, res) => {
  let view = req.path === "/" ? "index" : req.path.slice(1);

  if (view.endsWith(".ejs")) view = view.slice(0, -4);

  view = view.split("/").filter(Boolean).join("/");

  const locals: Record<string, unknown> = { query: req.query };

  if (view === "blog") {
    locals.posts = await readBlogPosts();
  }

  res.render(view, locals, (err: Error | null, html?: string) => {
    if (err) {
      if (
        (err as Error).message &&
        /Failed to lookup view/.test((err as Error).message)
      ) {
        res.status(404).send(`Template not found: ${view}`);
        return;
      }
      console.error(err);
      res.status(500).send("Template render error");
      return;
    }
    res.send(html ?? "");
  });
});

app.listen(PORT, () => {
  console.log(
    `Dev server listening on http://localhost:${PORT} (views: ${VIEWS_DIR})`
  );
});
