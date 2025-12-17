import type { NextApiRequest, NextApiResponse } from "next";
import verifyToken from "@/lib/api/verifyToken";
import { prisma } from "@linkwarden/prisma";
import autoAssignCollection from "../../../../../worker/lib/autoAssignCollection";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ response: "Method not allowed." });

  const token = await verifyToken({ req });

  if (typeof token === "string")
    return res.status(401).json({ response: token });

  const user = await prisma.user.findUnique({ where: { id: token.id } });

  if (!user)
    return res.status(404).json({ response: "User not found." });

  if (!user.aiCollectionsEnabled)
    return res
      .status(400)
      .json({ response: "AI collection routing is disabled." });

  if (
    !(
      process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT_URL ||
      process.env.OPENAI_API_KEY ||
      process.env.AZURE_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.PERPLEXITY_API_KEY
    )
  ) {
    return res.status(400).json({ response: "No AI provider configured." });
  }

  const links = await prisma.link.findMany({
    where: { collection: { ownerId: user.id }, aiCollectionAssigned: false },
    select: {
      id: true,
      description: true,
      textContent: true,
      collectionId: true,
    },
    take: 50,
  });

  let processed = 0;

  for (const link of links) {
    await autoAssignCollection(user, link.id, {
      metaDescription: link.description,
      pageContent: link.textContent?.slice(0, 2000),
    });
    processed++;
  }

  return res.status(200).json({ response: { processed } });
}
