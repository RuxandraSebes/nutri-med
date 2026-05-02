import express from "express";
import { Ollama } from "ollama";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OLLAMA_MODEL || "llama3.2:3b";
const numPredict =
  process.env.OLLAMA_NUM_PREDICT != null
    ? Number(process.env.OLLAMA_NUM_PREDICT)
    : 350;
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
      model,
      messages: [{ role: "user", content: prompt }],
      options: Number.isFinite(numPredict)
        ? { num_predict: numPredict }
        : undefined,
    });
    res.json({ result: response.message.content });
  } catch (error) {
    console.error("Error during inference:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

app.post("/analyze-journal", async (req, res) => {
  try {
    let { journalEntries, patientDetails, specialistDetails } = req.body;

    if (!journalEntries) {
      return res.status(400).json({ error: "No journal entries provided" });
    }

    // ✅ FIX: support string OR array OR object
    let journalText = "";

    if (typeof journalEntries === "string") {
      journalText = journalEntries;
    } else if (Array.isArray(journalEntries)) {
      journalText = journalEntries
        .map((j) => `[${j.date || "unknown"}] ${j.text || ""}`)
        .join("\n");
    } else if (typeof journalEntries === "object") {
      journalText = JSON.stringify(journalEntries, null, 2);
    }

    const prompt = `
You are a professional nutrition auditor.
   Analyze the provided food journal and patient context and return a response following this strict format:
PATIENT:
${JSON.stringify(patientDetails || {}, null, 2)}

SPECIALIST CONTEXT:
${JSON.stringify(specialistDetails || {}, null, 2)}

JOURNAL:
${journalText}

Return STRICT format:

SCORE: 1-10
ANALYSIS: one sentence clinical summary
IMPROVED VERSION:
breakfast:
lunch:
dinner:
snacks:
`;

    const response = await ollama.chat({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are professional nutrition auditor. Be direct, clinical and precise.",
        },
        { role: "user", content: prompt },
      ],
      options: Number.isFinite(numPredict)
        ? { num_predict: numPredict }
        : undefined,
    });

    res.json({ analysis: response.message.content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Analysis failed" });
  }
});

// app.post("/analyze-journal", async (req, res) => {
//   try {
//     const { foodEntry } = req.body;
//     if (!foodEntry)
//       return res.status(400).json({ error: "foodEntry is required" });

//     const systemPrompt = `You are a professional nutrition auditor.
//         Analyze the provided food journal and return a response following this strict format:
//         1. SCORE: Provide a rating from 1 to 10 based on nutritional density and glycemic index (10 being perfect).
//         2. ANALYSIS: One short sentence explaining the score.
//         3. IMPROVED VERSION: Provide a version for 3 main meals: breakfast, lunch and dinner and 2 snacks, between the meals that fix the nutritional gaps found.

//         Rules:
//         - Do not use polite filler phrases or introductory sentences like "The user's food...".
//         - Do not provide general encouragement.
//         - Be direct, clinical, and precise.
//         - Respond only in English.`;

//     const response = await ollama.chat({
//       model,
//       messages: [
//         { role: "system", content: systemPrompt },
//         { role: "user", content: `Journal Entry: ${foodEntry}` },
//       ],
//       options: Number.isFinite(numPredict) ? { num_predict: numPredict } : undefined,
//     });

//     res.status(200).json({
//       success: true,
//       analysis: response.message.content,
//     });
//   } catch (error) {
//     console.error("Inference Error:", error);
//     res.status(500).json({ success: false, error: "Internal Server Error" });
//   }
// });

app.listen(port, () => {
  console.log(`Nutri-Med AI Service running at http://localhost:${port}`);
});
