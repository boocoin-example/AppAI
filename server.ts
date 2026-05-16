import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, GenerateVideosOperation } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API routes
app.post("/api/generate-video", async (req: express.Request, res: express.Response) => {
  const { prompt, resolution = '720p', aspectRatio = '16:9' } = req.body;
  try {
    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-lite-generate-preview',
      prompt,
      config: {
        numberOfVideos: 1,
        resolution,
        aspectRatio,
      }
    });
    res.json({ operationName: operation.name });
  } catch (error: any) {
    console.error("Error generating video:", error);
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

app.post("/api/video-status", async (req: express.Request, res: express.Response) => {
  const { operationName } = req.body;
  try {
    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    res.json({ done: updated.done, response: updated.response });
  } catch (error: any) {
    console.error("Error checking video status:", error);
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

app.post("/api/video-download", async (req: express.Request, res: express.Response) => {
  const { operationName } = req.body;
  try {
    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    
    if (!updated.done) {
      return res.status(400).json({ error: "Operation not complete" });
    }

    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      return res.status(404).json({ error: "Video URI not found" });
    }

    const videoRes = await fetch(uri, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    });

    if (!videoRes.ok) {
        throw new Error(`Failed to fetch video: ${videoRes.statusText}`);
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="video-${Date.now()}.mp4"`);

    if (videoRes.body) {
        await videoRes.body.pipeTo(
            new WritableStream({
                write(chunk) {
                    res.write(chunk);
                },
                close() {
                    res.end();
                },
                abort(reason) {
                    console.error("Video stream aborted:", reason);
                    res.end();
                }
            })
        );
    } else {
        throw new Error("No video body content available");
    }

  } catch (error: any) {
    console.error("Error downloading video:", error);
    // Don't try to send headers if they're already sent
    if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Unknown error" });
    } else {
        res.end();
    }
  }
});

// Vite middleware
async function startServer() {
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req: express.Request, res: express.Response) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer().catch(console.error);
