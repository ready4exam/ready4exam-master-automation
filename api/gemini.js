// api/gemini.js
// -------------------------------------------------------------
// Phase-3 Stable Gemini Question Generator
// • Strict NCERT/CBSE aligned 60-question CSV
// • Simple / Medium / Advanced distribution (20 each)
// • MCQ / AR / Case-Based (10/5/5 each)
// -------------------------------------------------------------

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";

  const headers = {
    ...getCorsHeaders(origin),
    "Content-Type": "application/json",
  };

  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const { meta } = req.body;

    if (!meta?.class_name || !meta?.subject || !meta?.chapter) {
      return res.status(400).json({ ok: false, error: "Missing metadata." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // -------------------------------------------------------------
    // FINAL PHASE-3 QUESTION GENERATION PROMPT
    // -------------------------------------------------------------
    const prompt = `
Generate exactly **60 unique quiz questions** strictly from NCERT/CBSE syllabus for:

Class: ${meta.class_name}
Subject: ${meta.subject}
Book: ${meta.book}
Chapter: ${meta.chapter}

Your output must be **pure CSV** with headers:

difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key

NO “id”, NO serial numbers, NO markdown, NO formatting, NO quotes around headers.

Follow EXACT rules below:

------------------------------------------------------------
🔵 **Distribution Rules (Total 60 Questions)**
------------------------------------------------------------
* **Simple:** 20 questions  
  - 10 MCQ  
  - 5 AR  
  - 5 Case-Based  

* **Medium:** 20 questions  
  - 10 MCQ  
  - 5 AR  
  - 5 Case-Based  

* **Advanced:** 20 questions  
  - 10 MCQ  
  - 5 AR  
  - 5 Case-Based  


------------------------------------------------------------
🔵 **SCHEMA RULES (MUST MATCH EXACTLY)**
------------------------------------------------------------
difficulty → only “Simple”, “Medium”, “Advanced”  
question_type → only “MCQ”, “AR”, “Case-Based”

question_text → core question (or Assertion for AR)  
scenario_reason_text →  
• for MCQ → keep empty  
• for AR → Reason (R)  
• for Case-Based → Scenario/Case paragraph  

option_a / option_b / option_c / option_d →  
• MCQ → 4 normal options  
• AR → must ALWAYS use:

A: Both A and R are true, and R is the correct explanation of A.  
B: Both A and R are true, but R is not the correct explanation of A.  
C: A is true, but R is false.  
D: A is false, but R is true.  

correct_answer_key → A/B/C/D (uppercase, no spaces)

------------------------------------------------------------
❗ IMPORTANT
------------------------------------------------------------
• CSV **must contain exactly 60 rows** after the header  
• DO NOT wrap text in quotes unless required by CSV rules  
• Ensure strict NCERT language accuracy  
• Keep all difficulty labels EXACTLY: “Simple”, “Medium”, “Advanced”  
• Keep all question types EXACTLY: “MCQ”, “AR”, “Case-Based”
• DO NOT add extra commentary, markdown, or code fences

Now generate ONLY the CSV.
`;

    // -------------------------------------------------------------
    // CALL GEMINI
    // -------------------------------------------------------------
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // -------------------------------------------------------------
    // Return CSV lines to frontend
    // -------------------------------------------------------------
    return res.status(200).json({
      ok: true,
      questions: text,
    });

  } catch (err) {
    console.error("❌ Gemini error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
