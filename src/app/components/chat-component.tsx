import type { CompletionMessage } from "@/hooks/use-completion";
import { MarkdownBlock } from "@/components/ui/markdown-block";
import { AlertCircle, CornerDownLeft, Link as LinkIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { MicButton } from "./mic-button";
import Image from "next/image";

export function ChatComponent({
	messages,
	error,
	handleNewMessage,
	defaultPrompt,
	logo,
	urls,
}: {
	messages: CompletionMessage[];
	error?: Error | null;
	handleNewMessage: (message: string) => void;
	defaultPrompt: string;
	logo: string;
	urls: string[];
}) {
	if (urls && urls.length > 0) {
		console.log("URLs received in component:", urls);
	  }
	  

	const chatContainerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [input, setInput] = useState(defaultPrompt);

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (input.trim() !== '') {
			handleNewMessage(input);
			setInput("");
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: execute only when messages change
	useEffect(() => {
		// scroll to bottom
		const chatContainer = chatContainerRef.current;
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	}, [messages]);

	// select input text when focused
	useEffect(() => {
		const input = inputRef.current;
		if (input) {
			input.select();
		}
	}, []);

	// Format URL for display
	const formatUrl = (url: string) => {
		try {
			const urlObj = new URL(url);
			// Display hostname + first 15 chars of pathname
			return `${urlObj.hostname}${urlObj.pathname.substring(0, 15)}${urlObj.pathname.length > 15 ? '...' : ''}`;
		} catch {
			// If URL parsing fails, just show first 30 chars
			return url.length > 30 ? url.substring(0, 30) + '...' : url;
		}
	};

	return (
		<div className="flex flex-col gap-6 h-svh items-center p-10 pb-6 overflow-y-auto w-full">
			<div><Image src={logo} alt="Background" width={200} height={200} className="" /></div>
			<div className="w-full flex-1 overflow-y-auto" ref={chatContainerRef}>
				<div className="flex flex-col gap-4">
					{messages.map((message, index) => (
						<div
							key={`${message.role}-${index}`}
							className="max-w-[500px] last:mb-10"
						>
							<div className="opacity-50">{message.role}</div>
							<MarkdownBlock>
								{message.tool_calls ? "(using tool)" : message.content}
							</MarkdownBlock>
							{message.urls && message.urls.length > 0 && (
								<div className="mt-2 border-l-2 border-gray-200 pl-3">
									<h3 className="text-sm font-semibold flex items-center gap-1">
										<LinkIcon className="w-3 h-3" /> 
										Message Sources:
									</h3>
									<ul className="text-sm">
										{message.urls.map((url, i) => (
											<li key={i} className="mt-1">
												<a
													href={url}
													target="_blank"
													rel="noopener noreferrer"
													className="text-blue-600 hover:text-blue-800 hover:underline flex items-start gap-1"
												>
													<span className="shrink-0">•</span>
													<span className="break-all">{formatUrl(url)}</span>
												</a>
											</li>
										))}
									</ul>
								</div>
							)}
						</div>
					))}
				</div>
			</div>
			{error && (
				<div className="flex justify-center items-center gap-3 bg-destructive text-destructive-foreground py-2 px-4 rounded-md">
					<AlertCircle className="w-4 h-4" />
					{error.message}
				</div>
			)}
			<form
				className="flex justify-center gap-4 w-full"
				onSubmit={handleSubmit}
			>
				<Input
					placeholder="Enter a prompt"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					className="flex-1 w-auto"
					autoFocus
					ref={inputRef}
				/>
				<Button type="submit">
					<CornerDownLeft className="w-4 h-4" /> Send
				</Button>
				<MicButton 
					onTranscription={(transcription) => {
						if (transcription.trim() !== '') {
							handleNewMessage(transcription);
						}
					}} 
				/>
			</form>
			
			{/* Global URL section at the bottom of the chat */}
			{urls && urls.length > 0 && (
				<div className="w-full mt-2 p-4 border border-gray-200 rounded-md bg-gray-50">
					<h3 className="text-sm font-bold flex items-center gap-2 mb-2">
						<LinkIcon className="w-4 h-4" />
						Search Results:
					</h3>
					<ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{urls.map((url, i) => (
							<li key={i} className="text-sm overflow-hidden">
								<a
									href={url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-600 hover:text-blue-800 hover:underline flex items-start gap-1"
								>
									<span className="shrink-0">•</span>
									<span className="break-all">{formatUrl(url)}</span>
								</a>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}