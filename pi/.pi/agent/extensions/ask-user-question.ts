import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Interactive Ask User Question Extension
 *
 * Adds an `ask_user_question` tool that lets the model pause and ask the user
 * for structured input through Pi's interactive UI:
 * - free-form: text input dialog
 * - single: selection dialog
 * - multiple: editor dialog for comma-separated option choices
 */
export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user_question",
		label: "Ask User",
		description:
			"Ask the user one targeted question using an interactive UI. Supports free-form, single-selection, and multiple-selection questions. Use only when progress depends on user input.",
		promptSnippet: "Ask the user a targeted interactive question and wait for their answer",
		promptGuidelines: [
			"Use ask_user_question when you need a user decision or missing information before continuing.",
			"Ask exactly one question per ask_user_question call.",
			"For known choices, prefer type='single' or type='multiple' with explicit options.",
		],
		parameters: Type.Object({
			type: StringEnum(["free-form", "single", "multiple"] as const, {
				description: "Question style: free-form text, single selection, or multiple selection.",
			}),
			question: Type.String({ description: "One concise question to ask the user." }),
			why: Type.Optional(Type.String({ description: "Short explanation of why the answer is needed." })),
			options: Type.Optional(
				Type.Array(Type.String(), {
					description: "Options for single or multiple selection questions.",
				}),
			),
			recommended: Type.Optional(
				Type.Array(Type.String(), {
					description: "Recommended option labels or 1-based option numbers.",
				}),
			),
			placeholder: Type.Optional(
				Type.String({ description: "Placeholder text for free-form answers." }),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (signal?.aborted) {
				return { content: [{ type: "text", text: "Question cancelled." }], details: { cancelled: true } };
			}

			if (!ctx.hasUI) {
				throw new Error("ask_user_question requires interactive UI");
			}

			const title = params.why ? `${params.question}\n\nWhy: ${params.why}` : params.question;
			let answer: string | undefined;

			if (params.type === "free-form") {
				answer = await ctx.ui.input(title, params.placeholder ?? "Type your answer...");
			} else if (params.type === "single") {
				const options = normalizeOptions(params.options);
				if (options.length === 0) throw new Error("single selection questions require options");

				answer = await ctx.ui.select(withRecommended(title, options, params.recommended), options);
			} else {
				const options = normalizeOptions(params.options);
				if (options.length === 0) throw new Error("multiple selection questions require options");

				const prefill = buildMultipleChoicePrefill(options, params.recommended);
				const raw = await ctx.ui.editor(
					`${withRecommended(title, options, params.recommended)}\n\nEnter comma-separated option numbers or labels, or 'none':`,
					prefill,
				);
				answer = raw === undefined ? undefined : parseMultipleAnswer(raw, options).join(", ");
			}

			if (answer === undefined || answer.trim() === "") {
				return { content: [{ type: "text", text: "User cancelled or provided no answer." }], details: { cancelled: true } };
			}

			return {
				content: [{ type: "text", text: `User answered: ${answer}` }],
				details: {
					type: params.type,
					question: params.question,
					answer,
				},
			};
		},
	});
}

function normalizeOptions(options: string[] | undefined): string[] {
	return (options ?? []).map((option) => option.trim()).filter(Boolean);
}

function withRecommended(title: string, options: string[], recommended: string[] | undefined): string {
	const optionLines = options.map((option, index) => `${index + 1}. ${option}`).join("\n");
	const recommendedText = recommended?.length ? `\n\nRecommended: ${recommended.join(", ")}` : "";
	return `${title}\n\n${optionLines}${recommendedText}`;
}

function buildMultipleChoicePrefill(options: string[], recommended: string[] | undefined): string {
	if (!recommended?.length) return "";
	return recommended
		.map((item) => {
			const asNumber = Number(item);
			if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) return String(asNumber);
			const index = options.findIndex((option) => option.toLowerCase() === item.toLowerCase());
			return index >= 0 ? String(index + 1) : item;
		})
		.join(", ");
}

function parseMultipleAnswer(raw: string, options: string[]): string[] {
	const trimmed = raw.trim();
	if (trimmed.toLowerCase() === "none") return [];

	const answers = trimmed
		.split(/[\n,]/g)
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const asNumber = Number(part);
			if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
				return options[asNumber - 1];
			}

			const exact = options.find((option) => option.toLowerCase() === part.toLowerCase());
			return exact ?? part;
		});

	return [...new Set(answers)];
}
