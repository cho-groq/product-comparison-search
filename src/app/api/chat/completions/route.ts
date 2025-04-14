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
				while (!done) {
					const { value, done: doneReading } = await reader.read();
					done = doneReading;

					if (value) {
						const chunk = decoder.decode(value, { stream: true });

						// The server sends SSE-like lines in the format:  data: chunk\n\n
						const lines = chunk.split("\n\n");
						for (const line of lines) {
							if (line.startsWith("data: ")) {
								const data = line.slice("data: ".length);
								console.log("Received data:", data);

								if (data.trim() !== '') {
									if (isValidJSON(data)) {
										try {
											const jsonData = JSON.parse(data);
											console.log("Parsed JSON data:", jsonData);

											// Handle the JSON data here
											const text = jsonData.choices?.[0]?.delta?.content ?? "";
											const tool_calls = jsonData.choices?.[0]?.delta?.tool_calls ?? [];

											if (text !== "[DONE]") {
												// Append chunk to the last assistant message in state
												controller.enqueue(
													encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
												);

												// Extract URLs from the response
												const urls = [];
												if (tool_calls.length > 0) {
													tool_calls.forEach((tool_call) => {
														const output = tool_call.output;
														const regex = /https?:\/\/[^\s]+/g;
														const matches = output.match(regex);
														if (matches) {
															urls.push(...matches);
														}
													});
													console.log("Extracted URLs:", urls);
												}

												// Return the URLs in the response
												if (urls.length > 0) {
													controller.enqueue(
														encoder.encode(`data: ${JSON.stringify({ urls })}\n\n`)
													);
												}
											}
										} catch (err) {
											console.error("Error parsing JSON:", err);
											controller.error("Error parsing JSON");
											return;
										}
									}
								}
							}
						}
					}
				}

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
