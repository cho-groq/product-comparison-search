import { useState, useCallback, useEffect } from "react";
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions.mjs";

interface ToolCallInstruction {
	type: "function";
	id: string;
	function: {
		name: string;
		arguments: string;
	};
}

export interface CompletionMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string;
	tool_calls?: ToolCallInstruction[];
	tool_call_id?: string;
	name?: string;
	urls?: string[];
}

export interface CompletionDefaults {
	messages?: CompletionMessage[];
	tools?: ChatCompletionTool[];
}

export function useCompletion({
	messages: defMsgs = [],
	tools: defTools = [],
}: CompletionDefaults = {}) {
	const [error, setError] = useState<Error | null>(null);
	const [loading, setLoading] = useState(false);
	const [messages, setMessages] = useState<CompletionMessage[]>(defMsgs);
	const [tools, setTools] = useState<ChatCompletionTool[]>(defTools);
	const [triggerSend, setTriggerSend] = useState(false);
	const [urls, setUrls] = useState<string[]>([]);

	const reset = useCallback(() => {
		if (loading) {
			throw new Error("Cannot reset while loading");
		}

		setMessages([]);
		setTools([]);
		setError(null);
		setTriggerSend(false);
		setUrls([]);
	}, [loading]);

	// Helper function to extract URLs from text
	

	const sendMessages = useCallback(async () => {
		setError(null);
		setLoading(true);
		// Reset URLs for the new response
		setUrls([]);

		try {
			const response = await fetch("/api/chat/completions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages, tools }),
			});

			if (!response.ok) {
				throw new Error(
					(await response.json()).error ||
					`Request failed with code ${response.status}`,
				);
			}

			if (!response.body) {
				throw new Error("No response body from server");
			}

			// Create a new assistant message to populate with streamed text
			setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			
			// To store extracted URLs for the current message
			const messageUrls: string[] = [];

			let done = false;
			while (!done) {
				const { value, done: doneReading } = await reader.read();
				done = doneReading;

				if (value) {
					const chunk = decoder.decode(value, { stream: true });
					console.log("Raw chunk:", chunk);

					const lines = chunk.split("\n\n");
					for (const line of lines) {
						if (line.startsWith("data: ")) {
							const data = line.slice("data: ".length);
							if (!data.trim()) continue;

							try {
								console.log("Processing line:", data);
								const parsedData = JSON.parse(data);

								if (parsedData.text && parsedData.text !== "[DONE]") {
									setMessages((prev) => {
										const updated = [...prev];
										const lastIndex = updated.length - 1;
										if (lastIndex < 0) return updated;

										const lastMessage = updated[lastIndex];
										if (lastMessage.role === "assistant") {
											updated[lastIndex] = {
												...lastMessage,
												content: (lastMessage.content || "") + parsedData.text,
											};
										}
										return updated;
									});
								}

								// ✅ ONLY HANDLE URLs sent by the backend
								if (parsedData.urls && Array.isArray(parsedData.urls)) {
									console.log("Backend sent URLs:", parsedData.urls);

									setUrls(prev => {
										const deduped = [...new Set([...prev, ...parsedData.urls])];
										return deduped;
									});

									setMessages(prev => {
										const lastIndex = prev.length - 1;
										if (lastIndex < 0) return prev;

										const updated = [...prev];
										const lastMessage = updated[lastIndex];

										if (lastMessage.role === "assistant") {
											updated[lastIndex] = {
												...lastMessage,
												urls: [...new Set([...(lastMessage.urls || []), ...parsedData.urls])],
											};
										}

										return updated;
									});
								}
							} catch (err) {
								console.error("Error parsing data chunk:", err, data);
							}
						}
					}
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err : new Error("An unknown error occurred"));
		} finally {
			setLoading(false);
		}
	}, [messages, tools]);

	const addMessageAndSend = useCallback((message: CompletionMessage) => {
		if (message.content && message.content.trim() !== '') {
			setMessages((prev) => [...prev, message]);
			setTriggerSend(true);
		}
	}, []);

	const sendMessage = useCallback(
		(userMessage: string) => {
			if (userMessage.trim() !== '') {
				addMessageAndSend({ role: "user", content: userMessage });
			}
		},
		[addMessageAndSend],
	);

	useEffect(() => {
		if (triggerSend) {
			sendMessages();
			setTriggerSend(false);
		}
	}, [triggerSend, sendMessages]);

	return {
		error,
		loading,
		messages,
		setMessages,
		tools,
		setTools,
		reset,
		addMessageAndSend,
		sendMessage,
		urls,
	};
}