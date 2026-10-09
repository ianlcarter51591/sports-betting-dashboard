import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const { images = [], prompt = '', useSearch = false } = req.body;
      
      if (!images || images.length === 0) {
        return res.status(400).json({ error: 'Please upload at least one sportsbook screenshot to analyze.' });
      }

      // Format image parts cleanly
      const imageParts = images.map((img: string) => {
        const match = img.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return {
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          };
        }
        return {
          inlineData: {
            mimeType: 'image/jpeg',
            data: img,
          },
        };
      });

      const contents = {
        parts: [
          { text: prompt },
          ...imageParts,
        ]
      };

      // Set up chunked streaming headers for immediate real-time token delivery
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');

      // Speed Strategy: Stream directly using high-throughput multimodal flash model
      let streamSuccess = false;
      
      // Preferred fast models in order of latency and quota availability
      const candidateModels = [
        { name: 'gemini-3.1-flash-lite', tools: useSearch ? [{ googleSearch: {} }] : undefined },
        { name: 'gemini-3.8-flash', tools: useSearch ? [{ googleSearch: {} }] : undefined },
      ];

      for (const candidate of candidateModels) {
        try {
          const config: any = {};
          if (candidate.tools) {
            config.tools = candidate.tools;
          }

          const stream = await ai.models.generateContentStream({
            model: candidate.name,
            contents: contents,
            ...(Object.keys(config).length > 0 ? { config } : {})
          });

          for await (const chunk of stream) {
            if (chunk.text) {
              res.write(chunk.text);
            }
          }
          
          streamSuccess = true;
          break;
        } catch {
          // Failover smoothly to next candidate model without dumping error traces
        }
      }

      if (!streamSuccess) {
        res.write('Unable to generate analysis. Please try refreshing or uploading a clearer screenshot.');
      }

      res.end();
    } catch {
      if (!res.headersSent) {
        res.status(500).json({
          error: 'An issue occurred during image analysis. Please try again.'
        });
      } else {
        res.end();
      }
    }
  });

  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      allowedHosts: true,
    },
    appType: 'spa'
  });
  
  app.use(vite.middlewares);

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
