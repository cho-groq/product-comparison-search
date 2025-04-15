import Groq from "groq-sdk";
import type { NextRequest } from "next/server";
import json5 from 'json5';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const groq = new Groq({
  apiKey: GROQ_API_KEY,
});

function isValidJSON(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

// Function to extract URLs from output text
function extractUrls(output: string): string[] {
	const urlRegex = /https?:\/\/[^\s"'\]\}<>\\]+/g;
	const matches = output.match(urlRegex) || [];
  
	return matches.map((url) =>
	  url
		.replace(/\\.*$/, '') // remove everything after a backslash
		.replace(/[.,\/#!$%\^&\*;:{}=_`~()\n\r]+$/, '') // strip trailing punctuation
	);
  }

export async function POST(req: NextRequest) {
  if (!GROQ_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "GROQ_API_KEY not found on environment variables.",
      }),
      {
        status: 500,
      },
    );
  }

  let controllerRef;
  const encoder = new TextEncoder();
  let urlsBuffer = [];

  try {
    const body = await req.json();
    const { messages, tools } = body;
    console.log(messages);
    if (!messages) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
      });
    }

    if (!messages || messages.length === 0) {
      console.error("Error: messages array is empty");
      throw new Error("messages array cannot be empty");
    }
    
    const buildRequestHeaders = () => {
    //   console.log("key: "+process.env.GROQ_API_KEY);
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      };
    };

    const readableStream = new ReadableStream({
      async start(controller) {
		controllerRef = controller;

        const response = await fetch("https://compound-lib-505852467398.us-west1.run.app/v1/chat/completions", {
          method: "POST",
          headers: buildRequestHeaders(),
          body: JSON.stringify({
            model: "compound-beta",
            stream: true,
            messages,
            tools,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Fetch error:", response.status, errorText);
          controller.error(`Fetch failed: ${response.statusText}`);
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.error("Failed to get reader from response body");
          return;
        }

        let done = false;
		var fullText = "";

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;

          if (value) {
            const chunk = decoder.decode(value, { stream: true });

            // The server sends SSE-like lines in the format: data: chunk\n\n
            const lines = chunk.split("\n\n");
			for (const line of lines) {
				if (line.startsWith("data: ")) {
				  const data = line.slice("data: ".length);
				  console.log("Received data:", data);
			  
				  let jsonData = null;
			  
				  try {
					jsonData = json5.parse(data); // may fail
				  } catch (err) {
					console.warn("JSON parse failed — falling back to raw URL extract");
					const fallbackUrls = extractUrls(data);
					if (fallbackUrls.length > 0) {
					  urlsBuffer = [...new Set([...urlsBuffer, ...fallbackUrls])];
					  console.log("Recovered URLs from raw fallback:", urlsBuffer);
					}
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify({ urls: urlsBuffer })}\n\n`)
					  );
					  
					continue; // skip further logic for this chunk
				  }
			  
				  // Now safe to access parsed structure
				  const delta = jsonData.choices?.[0]?.delta ?? {};
				  const finishReason = jsonData.choices?.[0]?.finish_reason ?? "";
			  
				  if (delta.content) {
					fullText += delta.content;
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta.content })}\n\n`));
				  }

				  
			  
				  if (delta.executed_tools?.output) {
					console.log("Tool output raw:", delta.executed_tools.output);
					const extracted = extractUrls(delta.executed_tools.output);
					if (extracted.length > 0) {
					  urlsBuffer = [...new Set([...urlsBuffer, ...extracted])];
					  console.log("Extracted from executed_tools.output:", extracted);
					}
				  }
			  
				  if (finishReason === "stop") {
					if (urlsBuffer.length > 0) {
					  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ urls: urlsBuffer })}\n\n`));
					}
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: "[DONE]" })}\n\n`));
				  }
				}
			  }
			  
          }
        }

        controller.close();
      } // dont put a comma here
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
	console.warn("Non-critical JSON parse error, likely due to cutoff:", err);
  
	const cleaned = data.replace(/\\u[\dA-F]{4}/gi, '')
						.replace(/<\/?[\w\-]+>/g, '');
	const fallbackUrls = extractUrls(cleaned);
  
	if (fallbackUrls.length > 0) {
	  console.log("Recovered URLs from raw data:", fallbackUrls);
	  controllerRef.enqueue(
		encoder.encode(`data: ${JSON.stringify({ urls: fallbackUrls })}\n\n`)
	  );
	  console.log("urlsBuffer", urlsBuffer)
	}
  }
}