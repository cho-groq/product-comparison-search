import Groq from "groq-sdk";
import type { NextRequest } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const groq = new Groq({
	apiKey: GROQ_API_KEY,
});

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

	try {
		const body = await req.json();
		const { messages, tools } = body;
		console.log(messages)
		if (!messages) {
			return new Response(JSON.stringify({ error: "Missing prompt" }), {
				status: 400,
			});
		}

		const encoder = new TextEncoder();

		if (!messages || messages.length === 0) {
			console.error("Error: messages array is empty");
			throw new Error("messages array cannot be empty");
		}
		

		const buildRequestHeaders = () => {
			console.log("key: "+process.env.GROQ_API_KEY);
			return {
			  "Content-Type": "application/json",
			  Authorization: `Bearer ${process.env.GROQ_API_KEY}`, // Replace with actual authentication if needed
			};
		  };

		const readableStream = new ReadableStream({
			async start(controller) {
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

				// Debug: Check if response is OK
				if (!response.ok) {
					const errorText = await response.text();
					console.error("Fetch error:", response.status, errorText);
					controller.error(`Fetch failed: ${response.statusText}`);
					return;
				}

				// Debug: Check content type
				const contentType = response.headers.get("content-type");
				console.log("Response content type:", contentType);
				if (!contentType?.includes("text/event-stream")) {
					console.error("Unexpected content type:", contentType);
					controller.error("Unexpected content type, expected text/event-stream.");
					return;
				}

				const reader = response.body?.getReader();
				const decoder = new TextDecoder();

				if (!reader) {
					controller.error("Failed to get reader from response body");
					return;
				}
				

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
		
						const chunk = decoder.decode(value, { stream: true });
						console.log("Received chunk:", chunk); // Debug log
		
						// Split by newlines and filter valid JSON lines
						const jsonChunks = chunk
							.trim()
							.split("\n")
							.map(line => line.replace(/^data: /, "").trim()) // Remove "data: "
							.filter(line => line && line !== "[DONE]"); // Ignore empty lines and end signal
		
						for (const jsonString of jsonChunks) {
							try {
								const jsonChunk = JSON.parse(jsonString);
								console.log("Parsed JSON chunk:", jsonChunk); // Debug log
		
								const text = jsonChunk.choices?.[0]?.delta?.content ?? "";
								if (text) {
									controller.enqueue(
										encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
									);
								}
		
								const tool_calls = jsonChunk.choices?.[0]?.delta?.tool_calls ?? [];
								if (tool_calls.length > 0) {
									controller.enqueue(
										encoder.encode(`data: ${JSON.stringify({ tool_calls })}\n\n`)
									);
								}
							} catch (err) {
								console.error("Error parsing JSON chunk:", err, jsonString);
							}
						}
					}
				} catch (err) {
					console.error("Stream reading error:", err);
					controller.error("Error reading stream");
				}
		
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify({ text: "[DONE]" })}\n\n`)
				);
				controller.close();
			},
		});

		return new Response(readableStream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no",
			},
		});
	} catch (error) {
		console.error("API error:", error);
		return new Response(JSON.stringify({ error: "Something went wrong" }), {
			status: 500,
		});
	}
}
