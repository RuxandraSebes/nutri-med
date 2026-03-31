import express from "express";
import { Ollama } from "ollama";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 3000);
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || "http://host.docker.internal:11434",
});

app.use(cors());
app.use(express.json());

app.post("/ask", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const response = await ollama.chat({
      model: "mistral",
      messages: [{ role: "user", content: prompt }],
    });
    res.json({ result: response.message.content });
  } catch (error) {
    console.error("Error during inference:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

app.post("/analyze-journal", async (req, res) => {
  try {
    const { foodEntry } = req.body;
    if (!foodEntry)
      return res.status(400).json({ error: "foodEntry is required" });

    const systemPrompt = `You are a professional nutrition auditor. 
        Analyze the provided food journal and return a response following this strict format:
        1. SCORE: Provide a rating from 1 to 10 based on nutritional density and glycemic index (10 being perfect).
        2. ANALYSIS: One short sentence explaining the score.
        3. IMPROVED VERSION: Provide a version for 3 main meals: breakfast, lunch and dinner and 2 snacks, between the meals that fix the nutritional gaps found.
        
        Rules: 
        - Do not use polite filler phrases or introductory sentences like "The user's food...".
        - Do not provide general encouragement.
        - Be direct, clinical, and precise.
        - Respond only in English.`;

    const response = await ollama.chat({
      model: "mistral",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Journal Entry: ${foodEntry}` },
      ],
    });

    res.status(200).json({
      success: true,
      analysis: response.message.content,
    });
  } catch (error) {
    console.error("Inference Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Nutri-Med AI Service running at http://localhost:${port}`);
});
