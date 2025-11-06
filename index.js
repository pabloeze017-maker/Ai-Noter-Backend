import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import Groq from "groq-sdk";
import axios from "axios";
import FormData from "form-data";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import dotenv from 'dotenv';
dotenv.config();

const app = express();

// 🧱 SEGURIDAD BÁSICA
app.use(helmet()); // cabeceras seguras
app.disable("x-powered-by"); // oculta que usamos Express

// ✅ LIMITADOR DE PETICIONES (anti-flood)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 15, // 15 requests por IP por minuto
  message: { error: "Demasiadas peticiones, intentá más tarde." },
});
app.use(limiter);

// 🧩 CORS RESTRINGIDO
app.use(
  cors({
    origin: [
      "http://localhost:8081", // Desarrollo
      "https://tuappfront.vercel.app", // Producción
    ],
    methods: ["POST"],
  })
);

app.use(express.json({ limit: "2mb" }));

// 🗂️ UPLOAD SEGURO
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 25 * 1024 * 1024 }, // máximo 25 MB
  fileFilter: (req, file, cb) => {
    const allowed = ["audio/m4a", "audio/mp3", "audio/wav"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Formato de audio no permitido"));
    }
    cb(null, true);
  },
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ✅ TRANSCRIPCIÓN
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "No se envió ningún archivo" });

    console.log("📤 Transcribiendo:", req.file.originalname);

    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path), {
      filename: req.file.originalname || "audio.m4a",
      contentType: req.file.mimetype,
    });
    formData.append("model", "whisper-large-v3");

    const response = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          ...formData.getHeaders(),
        },
      }
    );

    const transcript = response.data.text?.trim() || "Sin texto reconocido";

    console.log("✅ Transcripción completa.");

    // 🧹 Limpieza segura del archivo temporal
    fs.unlink(req.file.path, (err) => {
      if (err) console.warn("⚠️ No se pudo eliminar archivo temporal:", err);
    });

    return res.json({ text: transcript });
  } catch (error) {
    console.error("❌ Error transcribiendo:", error.response?.data || error);
    res.status(500).json({ error: "Error al transcribir el audio" });
  }
});

// ✅ RESUMEN
app.post("/summarize", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) return res.status(400).json({ error: "Falta texto" });
    if (text.length > 20000)
      return res.status(400).json({ error: "Texto demasiado largo" });

    const summaryResponse = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: `Resumí este texto en español, en no más de 2 oraciones:\n\n${text}`,
        },
      ],
      temperature: 0.2,
    });

    const summary =
      summaryResponse.choices[0]?.message?.content?.trim() ||
      "No se pudo generar el resumen.";

    console.log("📄 Resumen generado correctamente.");
    res.json({ summary });
  } catch (error) {
    console.error("❌ Error resumiendo:", error.response?.data || error);
    res.status(500).json({ error: "Error al resumir el texto" });
  }
});

// ✅ RUTA SIMPLE DE SALUD
app.get("/", (req, res) => {
  res.send("✅ Servidor AI Noter activo y seguro.");
});
dotenv.config();
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend listo → http://localhost:${PORT}`);
});
