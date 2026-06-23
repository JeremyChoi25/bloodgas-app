import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

console.log("KEY PREFIX:", process.env.ANTHROPIC_API_KEY?.slice(0, 15) ?? "UNDEFINED");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json();

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: `This is a photo of a blood gas analyzer printout. Extract the values you can read.
Respond with ONLY valid JSON, no other text, in this exact shape:
{
  "pH": number or null,
  "pCO2": number or null,
  "pCO2_unit": "mmHg" or "kPa" or null,
  "pO2": number or null,
  "pO2_unit": "mmHg" or "kPa" or null,
  "HCO3": number or null,
  "BE": number or null,
  "Na": number or null,
  "K": number or null,
  "Cl": number or null,
  "lactate": number or null,
  "glucose": number or null,
  "low_confidence_fields": [array of field names you are unsure about]
}`,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    return NextResponse.json({ raw: textBlock?.text ?? "" });
  } catch (error: any) {
    console.error("Extraction error:", error);
    return NextResponse.json({ error: error.message ?? "Unknown error" }, { status: 500 });
  }
}