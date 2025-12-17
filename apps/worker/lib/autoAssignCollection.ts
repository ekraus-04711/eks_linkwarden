import { prisma } from "@linkwarden/prisma";
import { Link, User } from "@linkwarden/prisma/client";
import { generateObject, LanguageModelV1 } from "ai";
import {
  createOpenAICompatible,
  OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";
import { perplexity } from "@ai-sdk/perplexity";
import { azure } from "@ai-sdk/azure";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider";

const ensureValidURL = (base: string, path: string) =>
  `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

const getAIModel = (): LanguageModelV1 => {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    const config: OpenAICompatibleProviderSettings = {
      baseURL: process.env.CUSTOM_OPENAI_BASE_URL || "https://api.openai.com/v1",
      name: process.env.CUSTOM_OPENAI_NAME || "openai",
      apiKey: process.env.OPENAI_API_KEY,
    };

    const openaiCompatibleModel = createOpenAICompatible(config);

    return openaiCompatibleModel(process.env.OPENAI_MODEL);
  }

  if (
    process.env.AZURE_API_KEY &&
    process.env.AZURE_RESOURCE_NAME &&
    process.env.AZURE_MODEL
  )
    return azure(process.env.AZURE_MODEL);

  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL)
    return anthropic(process.env.ANTHROPIC_MODEL);

  if (process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT_URL && process.env.OLLAMA_MODEL) {
    const ollama = createOllama({
      baseURL: ensureValidURL(
        process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT_URL,
        "api"
      ),
    });

    return ollama(process.env.OLLAMA_MODEL, {
      structuredOutputs: true,
    });
  }

  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL) {
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    return openrouter(process.env.OPENROUTER_MODEL) as LanguageModelV1;
  }

  if (process.env.PERPLEXITY_API_KEY) {
    return perplexity(process.env.PERPLEXITY_MODEL || "sonar-pro");
  }

  throw new Error("No AI provider configured");
};

interface AssignmentContext {
  metaDescription?: string;
  pageContent?: string;
}

const buildPrompt = (
  link: Link & { collection: { name: string } },
  collections: { id: number; name: string; description: string }[],
  context: AssignmentContext
) => {
  const collectionList = collections
    .map(
      (collection) =>
        `${collection.id}: ${collection.name}${
          collection.description ? ` (${collection.description})` : ""
        }`
    )
    .join("\n-");

  const condensedContent = [
    link.name,
    link.description,
    context.metaDescription,
    context.pageContent,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);

  return `You are a Linkwarden assistant that routes links into one of the existing collections.
Pick exactly one collection id from the provided list. Prefer the best topical match.
If nothing clearly matches, keep the current collection id ${link.collectionId}.

Collections (id: name and optional description):
-${collectionList}

Link:
- URL: ${link.url}
- Current collection: ${link.collection.name}
- Summary: ${condensedContent}

Respond with only JSON in the form {"collectionId": <id from the list>}.`;
};

export const autoAssignCollection = async (
  user: User,
  linkId: number,
  context: AssignmentContext
) => {
  if (!user.aiCollectionsEnabled) return undefined;

  const link = await prisma.link.findUnique({
    where: { id: linkId },
    include: { collection: { select: { id: true, name: true } } },
  });

  if (!link || link.aiCollectionAssigned) return undefined;

  const collections = await prisma.collection.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true, description: true },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });

  if (collections.length === 0) return undefined;

  const prompt = buildPrompt(link, collections, context);

  let object: { collectionId: number };

  try {
    ({ object } = await generateObject({
      model: getAIModel(),
      prompt,
      schema: z.object({ collectionId: z.number().int() }),
    }));
  } catch (err) {
    console.log("AI collection assignment failed for link", link.id, err);
    return undefined;
  }

  const allowedIds = new Set(collections.map((c) => c.id));
  const chosenId = allowedIds.has(object.collectionId)
    ? object.collectionId
    : link.collectionId;

  if (chosenId === link.collectionId) {
    await prisma.link.update({
      where: { id: link.id },
      data: { aiCollectionAssigned: true },
    });

    return link.collectionId;
  }

  const updated = await prisma.link.update({
    where: { id: link.id },
    data: {
      collectionId: chosenId,
      aiCollectionAssigned: true,
    },
    include: { collection: { select: { id: true, name: true, ownerId: true } } },
  });

  return updated.collectionId;
};

export default autoAssignCollection;
